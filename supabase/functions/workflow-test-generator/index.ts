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
    console.log("Starting test case generation for workflow:", workflowRunId);

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

    // Fetch requirements that need test coverage
    const { data: requirements } = await supabase
      .from("requirements")
      .select("id, uid, title, description, type, priority")
      .eq("project_id", projectId);

    // Fetch hazards for safety test cases
    const { data: hazards } = await supabase
      .from("hazards")
      .select("id, uid, title, description, risk_level, sil, mitigation")
      .eq("project_id", projectId);

    // Fetch CEs for component-level testing
    const { data: ces } = await supabase
      .from("certifiable_elements")
      .select("id, uid, name, type, sil_target")
      .eq("project_id", projectId);

    // Fetch conformance items from this workflow for context
    const { data: conformanceArtifacts } = await supabase
      .from("ai_workflow_artifacts")
      .select("artifact_data")
      .eq("workflow_run_id", workflowRunId)
      .eq("artifact_type", "conformance_item");

    const framework = project.compliance_framework || "FTA";

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a safety certification test engineer specializing in ${framework} compliance. Generate comprehensive test cases for safety-critical systems.

Project: ${project.name}
Framework: ${framework}

Test Case Requirements:
1. Each requirement needs at least one verification test
2. High-risk hazards need dedicated safety tests
3. Test procedures must be specific and repeatable
4. Include expected results and pass/fail criteria
5. Reference specific requirements, hazards, or CEs
6. Prioritize based on SIL levels and risk`;

    const userPrompt = `Generate test cases for this certification project.

Requirements to cover (${requirements?.length || 0}):
${JSON.stringify(requirements?.slice(0, 15) || [], null, 2)}

Hazards requiring safety tests (${hazards?.filter(h => h.risk_level === 'high' || h.risk_level === 'critical').length || 0} high/critical):
${JSON.stringify(hazards?.filter(h => h.risk_level === 'high' || h.risk_level === 'critical')?.slice(0, 10) || [], null, 2)}

Certifiable Elements (${ces?.length || 0}):
${JSON.stringify(ces?.slice(0, 10) || [], null, 2)}

Conformance items to verify (${conformanceArtifacts?.length || 0}):
${JSON.stringify(conformanceArtifacts?.slice(0, 5)?.map(a => a.artifact_data) || [], null, 2)}

Generate test cases with clear procedures, expected results, and traceability to requirements/hazards.`;

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
              name: "generate_test_cases",
              description: "Generate test cases for safety certification",
              parameters: {
                type: "object",
                properties: {
                  test_cases: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string", 
                          description: "Test case title (max 100 chars)" 
                        },
                        description: { 
                          type: "string", 
                          description: "What this test verifies" 
                        },
                        test_type: {
                          type: "string",
                          enum: ["unit", "integration", "system", "acceptance", "safety"],
                          description: "Type of test"
                        },
                        procedure: {
                          type: "string",
                          description: "Step-by-step test procedure"
                        },
                        expected_result: {
                          type: "string",
                          description: "Expected outcome for pass"
                        },
                        priority: {
                          type: "string",
                          enum: ["critical", "high", "medium", "low"],
                          description: "Test priority"
                        },
                        linked_requirement_uid: {
                          type: "string",
                          description: "UID of requirement being tested"
                        },
                        linked_hazard_uid: {
                          type: "string",
                          description: "UID of hazard being mitigated"
                        },
                        linked_ce_uid: {
                          type: "string",
                          description: "UID of CE being tested"
                        },
                        verification_method: {
                          type: "string",
                          enum: ["test", "inspection", "analysis", "demonstration"],
                          description: "Verification method"
                        }
                      },
                      required: ["title", "description", "test_type", "procedure", "expected_result", "priority", "verification_method"],
                      additionalProperties: false,
                    },
                  },
                  coverage_summary: {
                    type: "object",
                    properties: {
                      total_tests: { type: "number" },
                      requirements_covered: { type: "number" },
                      hazards_covered: { type: "number" },
                      by_type: { type: "object" },
                      by_priority: { type: "object" },
                      gaps_identified: { type: "array", items: { type: "string" } }
                    },
                    required: ["total_tests", "requirements_covered", "hazards_covered"],
                    additionalProperties: false,
                  }
                },
                required: ["test_cases", "coverage_summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_test_cases" } },
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
    console.log(`Generated ${result.test_cases.length} test cases`);

    // Resolve linked IDs from UIDs
    const requirementMap = new Map(requirements?.map(r => [r.uid, r.id]) || []);
    const hazardMap = new Map(hazards?.map(h => [h.uid, h.id]) || []);
    const ceMap = new Map(ces?.map(c => [c.uid, c.id]) || []);

    // Store each test case as an artifact
    const artifacts = result.test_cases.map((tc: any, index: number) => ({
      workflow_run_id: workflowRunId,
      workflow_step_id: stepId,
      artifact_type: "test_case",
      artifact_data: {
        ...tc,
        linked_requirement_id: tc.linked_requirement_uid ? requirementMap.get(tc.linked_requirement_uid) : null,
        linked_hazard_id: tc.linked_hazard_uid ? hazardMap.get(tc.linked_hazard_uid) : null,
        linked_ce_id: tc.linked_ce_uid ? ceMap.get(tc.linked_ce_uid) : null,
        display_order: index + 1,
        generated_at: new Date().toISOString()
      },
      target_table: "test_cases",
      status: "pending_review",
      verification_method: tc.verification_method
    }));

    const { error: insertError } = await supabase
      .from("ai_workflow_artifacts")
      .insert(artifacts);

    if (insertError) {
      console.error("Failed to store test case artifacts:", insertError);
      throw new Error(`Failed to store artifacts: ${insertError.message}`);
    }

    // Store coverage summary
    await supabase.from("ai_workflow_artifacts").insert({
      workflow_run_id: workflowRunId,
      workflow_step_id: stepId,
      artifact_type: "test_coverage_summary",
      artifact_data: result.coverage_summary,
      status: "pending_review"
    });

    // Update step with output summary
    await supabase
      .from("ai_workflow_steps")
      .update({
        status: "awaiting_approval",
        output_summary: {
          tests_generated: result.test_cases.length,
          coverage: result.coverage_summary
        }
      })
      .eq("id", stepId);

    console.log("Test case generation complete");

    return new Response(
      JSON.stringify({
        success: true,
        tests_generated: result.test_cases.length,
        coverage: result.coverage_summary
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in test generator:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
