import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connect to external platform database
    const platformDbUrl = Deno.env.get("PLATFORM_DATABASE_URL");
    if (!platformDbUrl) {
      throw new Error("PLATFORM_DATABASE_URL is not configured");
    }

    const sql = postgres(platformDbUrl, { ssl: "require" });

    // Fetch accounts from platform
    const platformAccounts = await sql`
      SELECT id, name, slug, plan_tier, owner_id, stripe_customer_id, 
             subscription_status, max_users, max_projects, created_at, updated_at
      FROM accounts
      ORDER BY name
    `;

    // Fetch account members from platform
    const platformMembers = await sql`
      SELECT id, account_id, user_id, role, joined_at
      FROM account_members
    `;

    // Fetch account industry access from platform
    const platformIndustryAccess = await sql`
      SELECT id, account_id, industry_id, enabled_by, enabled_at
      FROM account_industry_access
    `;

    // Use service role for writes
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert accounts
    let accountsSynced = 0;
    for (const account of platformAccounts) {
      const { error } = await adminClient.from("accounts").upsert(
        {
          id: account.id,
          name: account.name,
          slug: account.slug || account.name.toLowerCase().replace(/\s+/g, "-"),
          plan_tier: account.plan_tier,
          owner_id: account.owner_id,
          stripe_customer_id: account.stripe_customer_id,
          subscription_status: account.subscription_status,
          max_users: account.max_users,
          max_projects: account.max_projects,
        },
        { onConflict: "id" }
      );
      if (error) {
        console.error(`Error upserting account ${account.name}:`, error);
      } else {
        accountsSynced++;
      }
    }

    // Upsert account members
    let membersSynced = 0;
    for (const member of platformMembers) {
      const { error } = await adminClient.from("account_members").upsert(
        {
          id: member.id,
          account_id: member.account_id,
          user_id: member.user_id,
          role: member.role,
          joined_at: member.joined_at,
        },
        { onConflict: "id" }
      );
      if (error) {
        console.error(`Error upserting member:`, error);
      } else {
        membersSynced++;
      }
    }

    // Upsert account industry access
    let industrySynced = 0;
    for (const access of platformIndustryAccess) {
      const { error } = await adminClient
        .from("account_industry_access")
        .upsert(
          {
            id: access.id,
            account_id: access.account_id,
            industry_id: access.industry_id,
            enabled_by: access.enabled_by,
            enabled_at: access.enabled_at,
          },
          { onConflict: "id" }
        );
      if (error) {
        console.error(`Error upserting industry access:`, error);
      } else {
        industrySynced++;
      }
    }

    await sql.end();

    return new Response(
      JSON.stringify({
        success: true,
        synced: {
          accounts: accountsSynced,
          members: membersSynced,
          industry_access: industrySynced,
        },
        totals: {
          accounts: platformAccounts.length,
          members: platformMembers.length,
          industry_access: platformIndustryAccess.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
