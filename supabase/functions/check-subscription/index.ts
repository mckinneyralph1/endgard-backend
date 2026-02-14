import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pricing tiers configuration
const PRODUCT_TO_TIER: Record<string, string> = {
  "prod_TjCf4o1ceSFr7s": "starter",
  "prod_TjCfL82Y2JTgdX": "professional",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header provided, returning unsubscribed state");
      return new Response(
        JSON.stringify({
          subscribed: false,
          tier: null,
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      logStep("Empty bearer token, returning unsubscribed state");
      return new Response(
        JSON.stringify({
          subscribed: false,
          tier: null,
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    logStep("Authenticating user with token");

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      logStep("Auth error, returning unsubscribed state", { message: userError.message });
      return new Response(
        JSON.stringify({
          subscribed: false,
          tier: null,
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const user = userData.user;
    if (!user?.email) {
      logStep("User missing email, returning unsubscribed state");
      return new Response(
        JSON.stringify({
          subscribed: false,
          tier: null,
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No customer found, returning unsubscribed state");
      return new Response(
        JSON.stringify({
          subscribed: false,
          tier: null,
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let tier = null;
    let subscriptionEnd = null;
    let productId = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];

      const currentPeriodEnd = (subscription as any)?.current_period_end;
      if (typeof currentPeriodEnd === "number" && Number.isFinite(currentPeriodEnd)) {
        subscriptionEnd = new Date(currentPeriodEnd * 1000).toISOString();
      } else {
        logStep("Missing or invalid current_period_end", { currentPeriodEnd });
        subscriptionEnd = null;
      }

      const firstItem = (subscription as any)?.items?.data?.[0];
      const rawProduct = firstItem?.price?.product;
      productId = rawProduct ? String(rawProduct) : null;
      tier = productId ? PRODUCT_TO_TIER[productId] || null : null;

      logStep("Active subscription found", {
        subscriptionId: subscription.id,
        endDate: subscriptionEnd,
        productId,
        tier,
      });
    } else {
      logStep("No active subscription found");
    }

    return new Response(
      JSON.stringify({
        subscribed: hasActiveSub,
        tier,
        product_id: productId,
        subscription_end: subscriptionEnd,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
