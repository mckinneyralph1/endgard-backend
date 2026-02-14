import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workflowRunId, projectId, userId } = await req.json();
    console.log("Starting final apply for workflow:", workflowRunId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all approved artifacts
    const { data: artifacts, error: fetchError } = await supabase
      .from("ai_workflow_artifacts")
      .select("*")
      .eq("workflow_run_id", workflowRunId)
      .eq("status", "approved");

    if (fetchError) throw new Error(`Failed to fetch artifacts: ${fetchError.message}`);

    console.log(`Found ${artifacts?.length || 0} approved artifacts to apply`);

    const results = {
      hazards: { inserted: 0, errors: [] as string[] },
      requirements: { inserted: 0, errors: [] as string[] },
      certifiable_elements: { inserted: 0, errors: [] as string[] },
      checklist_items: { inserted: 0, errors: [] as string[] },
      test_cases: { inserted: 0, errors: [] as string[] },
      traceability_links: { applied: 0, errors: [] as string[] }
    };

    // Group artifacts by type
    const hazardArtifacts = artifacts?.filter(a => a.artifact_type === "hazard") || [];
    const requirementArtifacts = artifacts?.filter(a => a.artifact_type === "requirement") || [];
    const ceArtifacts = artifacts?.filter(a => a.artifact_type === "certifiable_element") || [];
    const conformanceArtifacts = artifacts?.filter(a => a.artifact_type === "conformance_item") || [];
    const testCaseArtifacts = artifacts?.filter(a => a.artifact_type === "test_case") || [];
    const traceabilityArtifacts = artifacts?.filter(a => a.artifact_type === "traceability_link") || [];

    // Apply Certifiable Elements first (they may be referenced by hazards)
    for (const artifact of ceArtifacts) {
      try {
        const data = artifact.artifact_data;
        const { error } = await supabase.from("certifiable_elements").insert({
          project_id: projectId,
          uid: data.uid || `CE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: data.name,
          type: data.type || "system",
          description: data.description,
          sil_target: data.sil_target,
          status: "draft"
        });
        if (error) throw error;
        results.certifiable_elements.inserted++;
        await markArtifactApplied(supabase, artifact.id);
      } catch (e: any) {
        results.certifiable_elements.errors.push(e.message);
      }
    }

    // Apply Requirements
    for (const artifact of requirementArtifacts) {
      try {
        const data = artifact.artifact_data;
        const { error } = await supabase.from("requirements").insert({
          project_id: projectId,
          uid: data.uid || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          title: data.title,
          description: data.description,
          type: data.type || "functional",
          priority: data.priority || "medium",
          status: "draft"
        });
        if (error) throw error;
        results.requirements.inserted++;
        await markArtifactApplied(supabase, artifact.id);
      } catch (e: any) {
        results.requirements.errors.push(e.message);
      }
    }

    // Apply Hazards
    for (const artifact of hazardArtifacts) {
      try {
        const data = artifact.artifact_data;
        const { error } = await supabase.from("hazards").insert({
          project_id: projectId,
          uid: data.uid || `HAZ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          title: data.title,
          description: data.description,
          severity: data.severity || "moderate",
          likelihood: data.likelihood || "possible",
          risk_level: data.risk_level || "medium",
          sil: data.sil,
          mitigation: data.mitigation,
          analysis_type: data.analysis_type || "pha",
          status: "open"
        });
        if (error) throw error;
        results.hazards.inserted++;
        await markArtifactApplied(supabase, artifact.id);
      } catch (e: any) {
        results.hazards.errors.push(e.message);
      }
    }

    // Apply Conformance/Checklist Items
    for (const artifact of conformanceArtifacts) {
      try {
        const data = artifact.artifact_data;
        const { error } = await supabase.from("checklist_items").insert({
          project_id: projectId,
          title: data.title,
          description: data.description,
          category: data.category || "documentation",
          phase_id: data.phase_id,
          completed: false,
          display_order: data.display_order
        });
        if (error) throw error;
        results.checklist_items.inserted++;
        await markArtifactApplied(supabase, artifact.id);
      } catch (e: any) {
        results.checklist_items.errors.push(e.message);
      }
    }

    // Apply Test Cases
    for (const artifact of testCaseArtifacts) {
      try {
        const data = artifact.artifact_data;
        const { error } = await supabase.from("test_cases").insert({
          project_id: projectId,
          title: data.title,
          description: data.description,
          test_type: data.test_type || "system",
          procedure: data.procedure,
          expected_result: data.expected_result,
          priority: data.priority || "medium",
          status: "pending",
          requirement_id: data.linked_requirement_id,
          hazard_id: data.linked_hazard_id
        });
        if (error) throw error;
        results.test_cases.inserted++;
        await markArtifactApplied(supabase, artifact.id);
      } catch (e: any) {
        results.test_cases.errors.push(e.message);
      }
    }

    // Apply Traceability Links (update existing records with links)
    for (const artifact of traceabilityArtifacts) {
      try {
        const data = artifact.artifact_data;
        // Update hazard with CE link if applicable
        if (data.hazard_id && data.ce_id) {
          await supabase
            .from("hazards")
            .update({ ce_id: data.ce_id })
            .eq("id", data.hazard_id);
        }
        // Update hazard with requirement link if applicable
        if (data.hazard_id && data.requirement_id) {
          await supabase
            .from("hazards")
            .update({ requirement_id: data.requirement_id })
            .eq("id", data.hazard_id);
        }
        results.traceability_links.applied++;
        await markArtifactApplied(supabase, artifact.id);
      } catch (e: any) {
        results.traceability_links.errors.push(e.message);
      }
    }

    // Update workflow as completed
    await supabase
      .from("ai_workflow_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", workflowRunId);

    // Create a notification for the user (optional - ignore errors)
    try {
      await supabase.from("workflow_notifications").insert({
        user_id: userId,
        project_id: projectId,
        type: "workflow_complete",
        title: "AI Workflow Complete",
        message: `Successfully applied ${
          results.hazards.inserted + 
          results.requirements.inserted + 
          results.certifiable_elements.inserted + 
          results.checklist_items.inserted + 
          results.test_cases.inserted
        } items to your project.`,
        metadata: results
      });
    } catch {
      // Ignore if notification table doesn't exist
    }

    console.log("Final apply complete:", results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        total_applied: 
          results.hazards.inserted + 
          results.requirements.inserted + 
          results.certifiable_elements.inserted + 
          results.checklist_items.inserted + 
          results.test_cases.inserted +
          results.traceability_links.applied
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in final apply:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function markArtifactApplied(supabase: any, artifactId: string) {
  await supabase
    .from("ai_workflow_artifacts")
    .update({ 
      status: "applied",
      applied_at: new Date().toISOString()
    })
    .eq("id", artifactId);
}
