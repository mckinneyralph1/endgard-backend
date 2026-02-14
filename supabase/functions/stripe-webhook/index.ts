import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    console.log("Stripe event received:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0].price.id;
        
        // Map price to tier
        const tierMap: Record<string, string> = {
          [Deno.env.get("STRIPE_STARTER_PRICE_ID") || ""]: "starter",
          [Deno.env.get("STRIPE_PROFESSIONAL_PRICE_ID") || ""]: "professional",
          [Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID") || ""]: "enterprise",
        };
        const tier = tierMap[priceId] || "starter";

        // Update profile with subscription info
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            subscription_status: "active",
            subscription_tier: tier,
          })
          .eq("stripe_customer_id", customerId);

        console.log("Subscription activated for customer:", customerId);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const priceId = subscription.items.data[0].price.id;

        const tierMap: Record<string, string> = {
          [Deno.env.get("STRIPE_STARTER_PRICE_ID") || ""]: "starter",
          [Deno.env.get("STRIPE_PROFESSIONAL_PRICE_ID") || ""]: "professional",
          [Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID") || ""]: "enterprise",
        };
        const tier = tierMap[priceId] || "starter";

        await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: status,
            subscription_tier: tier,
          })
          .eq("stripe_customer_id", customerId);

        console.log("Subscription updated for customer:", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: "canceled",
            subscription_tier: null,
          })
          .eq("stripe_customer_id", customerId);

        console.log("Subscription canceled for customer:", customerId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: "past_due",
          })
          .eq("stripe_customer_id", customerId);

        console.log("Payment failed for customer:", customerId);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook error:", err);
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }
});
