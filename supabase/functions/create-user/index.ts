import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the request has a valid JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Create Supabase client with the user's JWT to verify authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Check if the authenticated user has manager role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (rolesError || !roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Forbidden: insufficient permissions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const hasManagerRole = roles.some(r => r.role === "manager" || r.role === "admin");
    if (!hasManagerRole) {
      return new Response(
        JSON.stringify({ error: "Forbidden: only managers can create users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { name, email, password, role, permissions, organization } = await req.json();

    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Use the admin client already created above for authorization check

    // Create the user
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const userId = userData.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Update profile name and organization if provided
    if (name || organization) {
      const updateData: { name?: string; organization?: string } = {};
      if (name) updateData.name = name;
      if (organization) updateData.organization = organization;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(updateData)
        .eq("id", userId);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }
    }

    // Set role if provided
    if (role && role !== "user") {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (roleError) {
        console.error("Error setting role:", roleError);
      }
    }

    // Set permissions if provided
    if (permissions && permissions.length > 0) {
      const permissionInserts = permissions.map((permission: string) => ({
        user_id: userId,
        permission,
      }));

      const { error: permError } = await supabaseAdmin
        .from("user_permissions")
        .insert(permissionInserts);

      if (permError) {
        console.error("Error setting permissions:", permError);
      }
    }

    return new Response(
      JSON.stringify({ user: userData.user, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});