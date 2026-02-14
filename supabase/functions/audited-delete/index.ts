import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Allowed entity types and their table mappings
const ENTITY_CONFIG: Record<
  string,
  { table: string; projectField: string; uidField?: string }
> = {
  hazard: { table: "hazards", projectField: "project_id", uidField: "uid" },
  requirement: { table: "requirements", projectField: "project_id", uidField: "uid" },
  test_case: { table: "test_cases", projectField: "project_id", uidField: "uid" },
  checklist_item: { table: "checklist_items", projectField: "project_id" },
  design_record: { table: "design_records", projectField: "project_id", uidField: "uid" },
  specification: { table: "specifications", projectField: "project_id", uidField: "uid" },
  certifiable_element: { table: "certifiable_elements", projectField: "project_id", uidField: "uid" },
  change_request: { table: "change_requests", projectField: "project_id" },
  project_blocker: { table: "project_blockers", projectField: "project_id" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity using anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { entity_type, entity_id, reason } = await req.json();

    if (!entity_type || !entity_id) {
      return new Response(
        JSON.stringify({ error: "entity_type and entity_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = ENTITY_CONFIG[entity_type];
    if (!config) {
      return new Response(
        JSON.stringify({ error: `Unsupported entity_type: ${entity_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for the actual operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch the entity before deletion (for audit snapshot)
    const { data: entity, error: fetchError } = await adminClient
      .from(config.table)
      .select("*")
      .eq("id", entity_id)
      .single();

    if (fetchError || !entity) {
      return new Response(
        JSON.stringify({ error: "Entity not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectId = entity[config.projectField];
    const entityUid = config.uidField ? entity[config.uidField] : entity_id;

    // 2. Log the deletion in the activity log BEFORE deleting
    await adminClient.from("activity_log").insert({
      project_id: projectId,
      user_id: user.id,
      user_email: user.email,
      entity_type,
      entity_id,
      entity_uid: entityUid,
      action: "delete",
      field_changes: null,
      metadata: {
        deleted_snapshot: entity,
        reason: reason || null,
        deleted_at: new Date().toISOString(),
      },
    });

    // 3. Perform the deletion
    const { error: deleteError } = await adminClient
      .from(config.table)
      .delete()
      .eq("id", entity_id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: `Delete failed: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_entity: { id: entity_id, uid: entityUid, type: entity_type },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
