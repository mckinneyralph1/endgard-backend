import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limit store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; resetMs: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || record.resetTime < now) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, resetMs: windowMs };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, resetMs: record.resetTime - now };
  }

  record.count++;
  return { allowed: true, resetMs: record.resetTime - now };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { projectName, framework, phaseId, phaseName, phaseDescription, categories, additionalContext } = body;

    if (!projectName || !framework || !phaseId || !phaseName || !phaseDescription || !categories) {
      throw new Error("Missing required fields");
    }

    // Rate limit: 10 requests per minute per phase
    const rateLimit = checkRateLimit(`checklist:${phaseId}`, 10, 60000);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetMs / 1000)} seconds.` 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const categoriesArray = categories as string[];

    const ftaContext = framework === 'FTA' ? `

CRITICAL: All items MUST be project-specific and aligned with FTA Circular 5800.1 "Safety and Security Management Guidance for Major Capital Projects." 

FTA 5800.1 SSCP Structure Reference:
- Section 1: Introduction (purpose, scope, definitions, objectives, methodology)
- Section 2: SSC Management (organization, SSCC committee, responsibility matrix)  
- Section 3: SSC Process & Procedures (CEs, DCCC, CSCC, V&V, integration testing, hazard analysis OHA/PHA/CHA, open items, certificates of conformance, training, public awareness, pre-revenue testing, SSC-VR)
- Section 4: Security (vulnerability assessment, CPTED, access control, cybersecurity, DHS/TSA coordination)
- Section 5: Documentation (controlled document management for all SSC records)
- Section 6: Reporting (monthly status, quarterly progress, milestone reports)
- Section 7: SSCP Revision (revision log, PMP alignment, milestone-based updates)

FTA 10-Step Methodology:
Step 1: Identify CEs/SCEs | Step 2: Develop Design Criteria | Step 3: DCCC | Step 4: CSCC
Step 5: Additional Test Requirements | Step 6: Testing & Validation | Step 7: Integrated Testing
Step 8: Manage Open Items (OIL) | Step 9: Verify Operational Readiness (PRO/PRSR)
Step 10: Final Determination & Issue SSC-VR

Reference FTA 5800.1 section numbers in item titles where applicable (e.g., "(FTA 5800.1 §3.2)").
Each item should be traceable to a specific FTA 5800.1 requirement or step.
` : '';

    const systemPrompt = `You are a safety certification expert specializing in transportation systems compliance. Your task is to generate detailed, project-specific conformance evidence items for safety certification projects.

You will generate conformance items for the ${framework} compliance framework, specifically for the "${phaseName}" phase.

Phase description: ${phaseDescription}

Available categories for this phase: ${categoriesArray.join(", ")}
${ftaContext}
Guidelines:
- Generate 5-8 specific, actionable conformance evidence items
- Each item MUST be project-specific using the compliance framework and agency guidance
- Each item should be relevant to the phase and project context
- Assign each item to one of the available categories
- Titles should be concise but descriptive (max 100 characters)
- Descriptions should explain what conformance evidence is required and why (max 300 characters)
- Focus on verifiable evidence requirements for certification
- Frame items as certification evidence obligations, not generic task lists
- For FTA projects: reference FTA Circular 5800.1 section numbers where applicable`;

    const userPrompt = `Generate conformance evidence items for the following project:

Project: ${projectName}
Framework: ${framework}
Phase: ${phaseName}
${additionalContext ? `Additional Context: ${additionalContext}` : ""}

Return the conformance items in the required format. Each item should represent a certification evidence obligation.`;

    console.log(`[PERF] Calling AI for checklist generation...`);
    const aiStart = Date.now();

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
              name: "generate_checklist_items",
              description: "Generate a list of conformance evidence items for safety certification",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string", 
                          description: "Concise title for the conformance evidence item (max 100 chars)" 
                        },
                        description: { 
                          type: "string", 
                          description: "Detailed description of the conformance evidence required (max 300 chars)" 
                        },
                        category: {
                          type: "string", 
                          description: "Category from the available options",
                          enum: categoriesArray.length > 0 ? categoriesArray : ["documentation", "verification", "validation"]
                        },
                      },
                      required: ["title", "description", "category"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_checklist_items" } },
      }),
    });

    console.log(`[PERF] AI call completed in ${Date.now() - aiStart}ms`);

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
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    const totalTime = Date.now() - startTime;
    console.log(`[PERF] Total request completed in ${totalTime}ms`);

    return new Response(JSON.stringify({
      ...result,
      _performance: { totalMs: totalTime }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ERROR] generate-checklist-items:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});