import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "sk_live_";
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const path = url.pathname.replace(/^\/manage-api-keys\/?/, "");

  try {
    if (req.method === "GET") {
      // List API keys for user
      const { data, error } = await supabaseAdmin
        .from("api_keys")
        .select("id, name, key_prefix, scopes, rate_limit_per_hour, last_used_at, expires_at, revoked_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { name, scopes, rate_limit_per_hour, expires_at } = body;

      if (!name) {
        return new Response(
          JSON.stringify({ error: "Name is required" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawKey = generateApiKey();
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.substring(0, 12) + "...";

      const { data, error } = await supabaseAdmin.from("api_keys").insert({
        user_id: userId,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: scopes || ["read:projects", "read:hazards", "read:requirements", "read:test_cases", "read:certifiable_elements", "read:certificates"],
        rate_limit_per_hour: rate_limit_per_hour || 1000,
        expires_at: expires_at || null,
      }).select().single();

      if (error) throw error;

      // Return the raw key only on creation
      return new Response(
        JSON.stringify({ data: { ...data, raw_key: rawKey } }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const { id, name, scopes, rate_limit_per_hour } = body;

      const { data, error } = await supabaseAdmin
        .from("api_keys")
        .update({ name, scopes, rate_limit_per_hour })
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
      const keyId = path || url.searchParams.get("id");
      if (!keyId) {
        return new Response(
          JSON.stringify({ error: "Key ID required" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Soft delete - revoke the key
      const { error } = await supabaseAdmin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", keyId)
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
