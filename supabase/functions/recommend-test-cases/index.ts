import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resilience configuration
const CONFIG = {
  AI_TIMEOUT_MS: 90000,
  MAX_RETRIES: 2,
};

// Performance monitoring
class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  checkpoint(name: string): void {
    this.checkpoints.set(name, Date.now() - this.startTime);
  }

  getSummary(): Record<string, number> {
    return Object.fromEntries(this.checkpoints);
  }
}

// Timeout wrapper for fetch calls
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  const monitor = new PerformanceMonitor();
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { hazardId, requirementId } = await req.json();
    monitor.checkpoint('request_parsed');

    if (!hazardId && !requirementId) {
      return new Response(
        JSON.stringify({ error: "Missing hazardId or requirementId" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    let sourceEntity: any = null;
    let sourceType: string = "";
    let projectId: string = "";

    // Fetch the source entity (hazard or requirement)
    if (hazardId) {
      const { data: hazard, error: hazardError } = await supabaseClient
        .from("hazards")
        .select("*")
        .eq("id", hazardId)
        .single();

      if (hazardError || !hazard) {
        return new Response(
          JSON.stringify({ error: "Hazard not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }
      
      sourceEntity = hazard;
      sourceType = "hazard";
      projectId = hazard.project_id;
    } else {
      const { data: requirement, error: reqError } = await supabaseClient
        .from("requirements")
        .select("*")
        .eq("id", requirementId)
        .single();

      if (reqError || !requirement) {
        return new Response(
          JSON.stringify({ error: "Requirement not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }
      
      sourceEntity = requirement;
      sourceType = "requirement";
      projectId = requirement.project_id;
    }

    // Fetch project to get primary standard
    const { data: project, error: projectError } = await supabaseClient
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Fetch linked requirement if hazard has one
    let linkedRequirement: any = null;
    if (sourceType === "hazard" && sourceEntity.requirement_id) {
      const { data: req } = await supabaseClient
        .from("requirements")
        .select("*")
        .eq("id", sourceEntity.requirement_id)
        .single();
      linkedRequirement = req;
    }

    // Fetch existing test cases for the project
    const { data: testCases, error: testError } = await supabaseClient
      .from("test_cases")
      .select("*")
      .eq("project_id", projectId);

    if (testError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch test cases" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    monitor.checkpoint('data_fetched');

    // Lovable research endpoint dependency removed; keep prompt shape stable.
    const externalResearch = "";
    monitor.checkpoint('research_complete');

    // Use OpenAI to analyze and recommend test case links
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a safety compliance expert specializing in multi-modal transportation systems certification with access to comprehensive external research from official standards bodies, industry publications, government regulations, and technical forums. Your task is to analyze ${sourceType === "hazard" ? "hazards" : "requirements"} and recommend test cases that ensure compliance with applicable safety standards.

**CRITICAL STANDARDS CONTEXT:**
- Primary Project Standard: ${project.standard}
${linkedRequirement ? `- Linked Requirement Standard: ${linkedRequirement.standard} (${linkedRequirement.uid})` : ""}
- You must ensure test recommendations align with both standards when applicable
- Integrate external research findings naturally into your recommendations

**EVIDENCE INTEGRATION:**
- Use the provided project context, source entity details, linked requirement, and existing test cases as the primary evidence base
- Cite specific standard clauses and regulatory references when proposing test coverage
- Ground recommendations in clear verification logic and traceability

**Test Case Design Principles:**
- Map each test to specific standard clauses/requirements for full traceability
- Incorporate industry best practices and proven methodologies from research
- Provide detailed test procedures with preconditions, test steps, and expected results
- Consider test type appropriateness (unit, integration, system, acceptance)
- Address safety aspects, risk mitigation, and verification/validation methodology
- For hazards: focus on demonstrating that mitigations are effective and risks are controlled
- For requirements: ensure verification method aligns with the requirement's intent
- Reference relevant regulatory guidance and compliance documentation

**Output Requirements:**
- Include standard clause references (e.g., "IEC 62278 §6.4.3.2" or "DO-178C Table A-3")
- Provide step-by-step test procedures using standard-aligned verification best practices
- Keep acceptance criteria generic (users will define specific pass/fail thresholds)
- Explain how each test contributes to standards compliance
- Reference applicable regulatory requirements and industry standards

If existing test cases can be reused, recommend them. Otherwise, suggest creating new test cases with comprehensive standard-aligned details.`;

    const userPrompt = `**PROJECT CONTEXT:**
- Project: ${project.name} (${project.code})
- Primary Standard: ${project.standard}
${linkedRequirement ? `- Linked Requirement: ${linkedRequirement.uid} - ${linkedRequirement.title} (Standard: ${linkedRequirement.standard})` : ""}

**${sourceType.toUpperCase()} TO ANALYZE:**
- UID: ${sourceEntity.uid}
- Title: ${sourceEntity.title}
- Description: ${sourceEntity.description || "N/A"}
${sourceType === "hazard" ? `- Severity: ${sourceEntity.severity}
- Likelihood: ${sourceEntity.likelihood}
- Risk Level: ${sourceEntity.risk_level}
- SIL: ${sourceEntity.sil || "N/A"}
- Analysis Type: ${sourceEntity.analysis_type}
- Mitigation Strategy: ${sourceEntity.mitigation || "N/A"}
- Status: ${sourceEntity.status}` : `- Category: ${sourceEntity.category}
- Priority: ${sourceEntity.priority}
- Standard: ${sourceEntity.standard}
- SIL: ${sourceEntity.sil || "N/A"}
- Verification Method: ${sourceEntity.verification_method || "N/A"}
- Status: ${sourceEntity.status}`}

${testCases && testCases.length > 0 ? `**EXISTING TEST CASES IN PROJECT:**
${testCases.map(tc => `
- ID: ${tc.id}
- UID: ${tc.uid}
- Title: ${tc.title}
- Description: ${tc.description || "N/A"}
- Type: ${tc.test_type}
- Status: ${tc.status}
`).join("\n")}` : "**No existing test cases in this project.**"}

${externalResearch ? `**EXTERNAL RESEARCH FINDINGS:**
${externalResearch}

Use these research findings to inform your test case recommendations. Integrate relevant standards documentation, industry best practices, regulatory requirements, and technical methodologies directly into your test case descriptions and procedures.` : ""}

**TASK:**
Analyze this ${sourceType} in the context of ${project.standard}${linkedRequirement ? ` and ${linkedRequirement.standard}` : ""}, then:
1. Recommend existing test cases that adequately verify this ${sourceType} (if any are suitable)
2. Suggest new test cases to create with detailed test procedures and standard clause mappings

Ensure all recommendations provide clear traceability to standard requirements and explain how they verify compliance using industry best practices.`;

    console.log("Calling AI for test case recommendations...");
    monitor.checkpoint('ai_call_start');

    const aiResponse = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "recommend_test_cases",
                description: "Return recommended test cases with standards compliance analysis",
                parameters: {
                  type: "object",
                  properties: {
                    existing_test_cases: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          test_case_id: { type: "string" },
                          test_case_uid: { type: "string" },
                          test_case_title: { type: "string" },
                          confidence: { type: "number", minimum: 0, maximum: 1 },
                          reasoning: { type: "string" },
                          standards_coverage: { type: "string", description: "Which standards and clauses this test addresses" }
                        },
                        required: ["test_case_id", "test_case_uid", "test_case_title", "confidence", "reasoning", "standards_coverage"],
                        additionalProperties: false
                      }
                    },
                    new_test_cases: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          suggested_title: { type: "string" },
                          suggested_description: { type: "string" },
                          suggested_type: { type: "string", enum: ["unit", "integration", "system", "acceptance"] },
                          test_procedure: { 
                            type: "object",
                            properties: {
                              preconditions: { type: "string" },
                              test_steps: { type: "array", items: { type: "string" } },
                              expected_results: { type: "string" }
                            },
                            required: ["preconditions", "test_steps", "expected_results"]
                          },
                          standard_clauses: { 
                            type: "array", 
                            items: { type: "string" },
                            description: "Specific standard clauses this test verifies (e.g., 'IEC 62278 §6.4.3.2')"
                          },
                          reasoning: { type: "string" }
                        },
                        required: ["suggested_title", "suggested_description", "suggested_type", "test_procedure", "standard_clauses", "reasoning"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["existing_test_cases", "new_test_cases"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "recommend_test_cases" } }
        }),
      },
      CONFIG.AI_TIMEOUT_MS
    );

    monitor.checkpoint('ai_response');

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add funds to continue." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 402 }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || !toolCall.function?.arguments) {
      return new Response(
        JSON.stringify({ existing_test_cases: [], new_test_cases: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    monitor.checkpoint('complete');
    console.log(`Test case recommendations complete. Performance: ${JSON.stringify(monitor.getSummary())}`);
    
    return new Response(
      JSON.stringify({ 
        existing_test_cases: result.existing_test_cases || [],
        new_test_cases: result.new_test_cases || [],
        source: {
          id: sourceEntity.id,
          uid: sourceEntity.uid,
          title: sourceEntity.title,
          type: sourceType
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Error in recommend-test-cases function:", error);
    
    const errorMessage = error.message || "Internal server error";
    
    if (errorMessage.includes('abort')) {
      return new Response(
        JSON.stringify({ error: "Request timed out. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 504 }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
