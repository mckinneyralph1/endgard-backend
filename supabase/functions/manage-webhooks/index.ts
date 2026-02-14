import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let secret = "whsec_";
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (req.method === "GET") {
      if (action === "deliveries") {
        const subId = url.searchParams.get("subscription_id");
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
        
        let query = supabaseAdmin
          .from("webhook_deliveries")
          .select("*, webhook_subscriptions!inner(user_id)")
          .eq("webhook_subscriptions.user_id", userId)
          .order("delivered_at", { ascending: false })
          .limit(limit);

        if (subId) query = query.eq("subscription_id", subId);

        const { data, error } = await query;
        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // List webhook subscriptions
      const { data, error } = await supabaseAdmin
        .from("webhook_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();

      if (action === "test") {
        // Test a webhook by sending a test payload
        const { subscription_id } = body;
        const { data: sub } = await supabaseAdmin
          .from("webhook_subscriptions")
          .select("*")
          .eq("id", subscription_id)
          .eq("user_id", userId)
          .single();

        if (!sub) {
          return new Response(JSON.stringify({ error: "Subscription not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const testPayload = {
          event: "test.ping",
          timestamp: new Date().toISOString(),
          data: { message: "This is a test webhook delivery from EndGard" },
        };

        const startTime = Date.now();
        try {
          const response = await fetch(sub.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Webhook-Secret": sub.secret },
            body: JSON.stringify(testPayload),
          });
          const responseTime = Date.now() - startTime;
          const responseBody = await response.text();

          await supabaseAdmin.from("webhook_deliveries").insert({
            subscription_id,
            event_type: "test.ping",
            payload: testPayload,
            response_status: response.status,
            response_body: responseBody.substring(0, 1000),
            response_time_ms: responseTime,
            success: response.ok,
          });

          return new Response(
            JSON.stringify({ success: response.ok, status: response.status, response_time_ms: responseTime }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (e) {
          await supabaseAdmin.from("webhook_deliveries").insert({
            subscription_id,
            event_type: "test.ping",
            payload: testPayload,
            response_status: 0,
            error_message: e.message,
            response_time_ms: Date.now() - startTime,
            success: false,
          });

          return new Response(
            JSON.stringify({ success: false, error: e.message }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Create webhook subscription
      const { name, url: webhookUrl, events, project_filter } = body;
      if (!name || !webhookUrl || !events?.length) {
        return new Response(
          JSON.stringify({ error: "name, url, and events are required" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const secret = generateSecret();
      const { data, error } = await supabaseAdmin.from("webhook_subscriptions").insert({
        user_id: userId,
        name,
        url: webhookUrl,
        secret,
        events,
        project_filter: project_filter || null,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const { id, name, url: webhookUrl, events, is_active, project_filter } = body;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (webhookUrl !== undefined) updateData.url = webhookUrl;
      if (events !== undefined) updateData.events = events;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (project_filter !== undefined) updateData.project_filter = project_filter;

      const { data, error } = await supabaseAdmin
        .from("webhook_subscriptions")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Subscription ID required" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabaseAdmin
        .from("webhook_subscriptions")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
