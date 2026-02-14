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
    const { workflowRunId, stepId, projectId } = await req.json();
    console.log("Starting conformance list generation for workflow:", workflowRunId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("name, compliance_framework, description")
      .eq("id", projectId)
      .single();

    if (projectError) throw new Error(`Failed to fetch project: ${projectError.message}`);

    // Fetch CEs for context
    const { data: ces } = await supabase
      .from("certifiable_elements")
      .select("uid, name, type, sil_target")
      .eq("project_id", projectId);

    // Fetch hazards for context
    const { data: hazards } = await supabase
      .from("hazards")
      .select("uid, title, risk_level, sil")
      .eq("project_id", projectId);

    // Fetch requirements for context
    const { data: requirements } = await supabase
      .from("requirements")
      .select("uid, title, type")
      .eq("project_id", projectId);

    // Fetch existing traceability artifacts from this workflow
    const { data: traceabilityArtifacts } = await supabase
      .from("ai_workflow_artifacts")
      .select("artifact_data")
      .eq("workflow_run_id", workflowRunId)
      .eq("artifact_type", "traceability_link");

    const framework = project.compliance_framework || "FTA";
    
    // Get framework phases for conformance items
    const frameworkPhases = getFrameworkPhases(framework);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a safety certification expert specializing in ${framework} compliance. Generate comprehensive conformance evidence items for a safety certification project.

Project: ${project.name}
Framework: ${framework}
Description: ${project.description || "Safety-critical system"}

Current Project Data:
- Certifiable Elements: ${ces?.length || 0} items
- Hazards: ${hazards?.length || 0} identified
- Requirements: ${requirements?.length || 0} defined
- Traceability Links: ${traceabilityArtifacts?.length || 0} established

Generate conformance items that:
1. Cover all framework phases appropriately
2. Reference specific CEs, hazards, and requirements where applicable
3. Include verification methods (inspection, analysis, test, demonstration)
4. Prioritize based on risk levels (high-risk items first)
5. Are specific and actionable for the certification team`;

    const userPrompt = `Generate a comprehensive conformance evidence list for this ${framework} certification project.

Available phases: ${frameworkPhases.map(p => p.name).join(", ")}

For each phase, generate 3-8 specific conformance items based on:
- CEs: ${JSON.stringify(ces?.slice(0, 10) || [])}
- High-risk hazards: ${JSON.stringify(hazards?.filter(h => h.risk_level === 'high' || h.risk_level === 'critical')?.slice(0, 10) || [])}
- Key requirements: ${JSON.stringify(requirements?.slice(0, 10) || [])}

Each item should specify the phase, category, title, description, and suggested verification method.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_conformance_list",
              description: "Generate conformance evidence items organized by phase",
              parameters: {
                type: "object",
                properties: {
                  conformance_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        phase_id: { 
                          type: "string", 
                          description: "Phase identifier (e.g., identify_ces, design_criteria)" 
                        },
                        category: { 
                          type: "string", 
                          description: "Category (documentation, verification, validation, safety_analysis)" 
                        },
                        title: { 
                          type: "string", 
                          description: "Concise title (max 100 chars)" 
                        },
                        description: { 
                          type: "string", 
                          description: "Detailed description of evidence required (max 300 chars)" 
                        },
                        verification_method: {
                          type: "string",
                          enum: ["inspection", "analysis", "test", "demonstration"],
                          description: "How this item will be verified"
                        },
                        priority: {
                          type: "string",
                          enum: ["high", "medium", "low"],
                          description: "Priority based on risk"
                        },
                        linked_ce_uid: {
                          type: "string",
                          description: "Optional: UID of related CE"
                        },
                        linked_hazard_uid: {
                          type: "string",
                          description: "Optional: UID of related hazard"
                        },
                        linked_requirement_uid: {
                          type: "string",
                          description: "Optional: UID of related requirement"
                        }
                      },
                      required: ["phase_id", "category", "title", "description", "verification_method", "priority"],
                      additionalProperties: false,
                    },
                  },
                  summary: {
                    type: "object",
                    properties: {
                      total_items: { type: "number" },
                      by_phase: { type: "object" },
                      by_priority: { type: "object" },
                      coverage_notes: { type: "string" }
                    },
                    required: ["total_items", "by_phase", "by_priority", "coverage_notes"],
                    additionalProperties: false,
                  }
                },
                required: ["conformance_items", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_conformance_list" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`Generated ${result.conformance_items.length} conformance items`);

    // Store each conformance item as an artifact
    const artifacts = result.conformance_items.map((item: any, index: number) => ({
      workflow_run_id: workflowRunId,
      workflow_step_id: stepId,
      artifact_type: "conformance_item",
      artifact_data: {
        ...item,
        display_order: index + 1,
        generated_at: new Date().toISOString()
      },
      target_table: "checklist_items",
      status: "pending_review",
      verification_method: item.verification_method
    }));

    const { error: insertError } = await supabase
      .from("ai_workflow_artifacts")
      .insert(artifacts);

    if (insertError) {
      console.error("Failed to store conformance artifacts:", insertError);
      throw new Error(`Failed to store artifacts: ${insertError.message}`);
    }

    // Store summary as separate artifact
    await supabase.from("ai_workflow_artifacts").insert({
      workflow_run_id: workflowRunId,
      workflow_step_id: stepId,
      artifact_type: "conformance_summary",
      artifact_data: result.summary,
      status: "pending_review"
    });

    // Update step with output summary
    await supabase
      .from("ai_workflow_steps")
      .update({
        status: "awaiting_approval",
        output_summary: {
          items_generated: result.conformance_items.length,
          summary: result.summary
        }
      })
      .eq("id", stepId);

    console.log("Conformance list generation complete");

    return new Response(
      JSON.stringify({
        success: true,
        items_generated: result.conformance_items.length,
        summary: result.summary
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in conformance generator:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getFrameworkPhases(framework: string) {
  const phases: Record<string, { id: string; name: string }[]> = {
    FTA: [
      { id: "identify_ces", name: "Identify Certifiable Elements" },
      { id: "design_criteria", name: "Establish Design Criteria" },
      { id: "hazard_analysis", name: "Hazard Analysis" },
      { id: "safety_requirements", name: "Safety Requirements" },
      { id: "design_verification", name: "Design Verification" },
      { id: "safety_certification", name: "Safety Certification" }
    ],
    APTA: [
      { id: "system_definition", name: "System Definition" },
      { id: "hazard_identification", name: "Hazard Identification" },
      { id: "risk_assessment", name: "Risk Assessment" },
      { id: "safety_requirements", name: "Safety Requirements" },
      { id: "verification_validation", name: "Verification & Validation" }
    ],
    EN_50129: [
      { id: "concept", name: "Concept Phase" },
      { id: "system_definition", name: "System Definition" },
      { id: "risk_analysis", name: "Risk Analysis" },
      { id: "system_requirements", name: "System Requirements" },
      { id: "design_implementation", name: "Design & Implementation" },
      { id: "validation", name: "Validation" }
    ]
  };
  return phases[framework] || phases.FTA;
}
