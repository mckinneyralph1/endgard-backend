import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CheckoutPayload = {
  tier?: string;
  successPath?: string;
  cancelPath?: string;
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const TIER_TO_PRICE: Record<string, string> = {
  starter: Deno.env.get("STRIPE_STARTER_PRICE_ID") ?? "",
  professional: Deno.env.get("STRIPE_PROFESSIONAL_PRICE_ID") ?? "",
  enterprise: Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID") ?? "",
};

const resolveCheckoutRequest = (payload: CheckoutPayload) => {
  if (!payload.tier) {
    throw new Error("Invalid checkout payload. Expected { tier }.");
  }

  const priceId = TIER_TO_PRICE[payload.tier];
  if (!priceId) {
    throw new Error(`No Stripe price mapping configured for tier '${payload.tier}'.`);
  }

  return {
    priceId,
    tier: payload.tier,
    successPath: payload.successPath ?? "/subscription-success?session_id={CHECKOUT_SESSION_ID}",
    cancelPath: payload.cancelPath ?? "/pricing?canceled=true",
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAuthClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    let payload: CheckoutPayload = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const resolved = resolveCheckoutRequest(payload);
    logStep("Resolved checkout payload", resolved);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }
    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseAuthClient.auth.getUser(token);
    if (authError) {
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if profile already has a stripe customer id
    let profileId: string | null = null;
    let customerId: string | undefined = undefined;
    const { data: profileById } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileById) {
      profileId = profileById.id;
      customerId = profileById.stripe_customer_id ?? undefined;
    } else {
      // Compatibility fallback for schemas that still expose profiles.user_id
      const { data: profileByUserId } = await supabaseAdmin
        .from("profiles")
        .select("id, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileByUserId) {
        profileId = profileByUserId.id;
        customerId = profileByUserId.stripe_customer_id ?? undefined;
      }
    }

    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing customer by email", { customerId });
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      logStep("Created Stripe customer", { customerId });
    }

    const targetProfileId = profileId ?? user.id;
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: targetProfileId,
          user_id: user.id,
          email: user.email,
          stripe_customer_id: customerId,
        },
        { onConflict: "id" }
      );

    if (resolved.tier) {
      await supabaseAdmin
        .from("profiles")
        .update({ subscription_tier: resolved.tier })
        .eq("id", targetProfileId);
    }

    const origin = req.headers.get("origin") || "https://example.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: resolved.priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}${resolved.successPath}`,
      cancel_url: `${origin}${resolved.cancelPath}`,
      metadata: {
        user_id: user.id,
        tier: resolved.tier,
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
