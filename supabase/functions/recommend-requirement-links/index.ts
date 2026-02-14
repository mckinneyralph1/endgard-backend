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

    const { hazardId } = await req.json();

    if (!hazardId) {
      return new Response(
        JSON.stringify({ error: "Missing hazardId" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch the hazard details
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

    // Fetch all requirements for the project
    const { data: requirements, error: reqError } = await supabaseClient
      .from("requirements")
      .select("*")
      .eq("project_id", hazard.project_id);

    if (reqError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch requirements" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!requirements || requirements.length === 0) {
      return new Response(
        JSON.stringify({ recommendations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Use OpenAI to analyze and recommend requirement links
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a safety compliance expert analyzing hazards and requirements. Your task is to recommend which requirements are most relevant to link to a given hazard based on their content, safety implications, and compliance needs.

Consider:
- Semantic relevance between hazard and requirement descriptions
- Safety integrity levels (SIL) alignment
- Risk level and requirement priority correlation
- Technical domain overlap
- Compliance standard alignment

Provide 1-3 most relevant requirements with confidence scores and clear reasoning.`;

    const userPrompt = `Analyze this hazard and recommend the most relevant requirements to link:

HAZARD:
- UID: ${hazard.uid}
- Title: ${hazard.title}
- Description: ${hazard.description || "N/A"}
- Severity: ${hazard.severity}
- Likelihood: ${hazard.likelihood}
- Risk Level: ${hazard.risk_level}
- SIL: ${hazard.sil || "N/A"}
- Mitigation: ${hazard.mitigation || "N/A"}

AVAILABLE REQUIREMENTS:
${requirements.map(r => `
- ID: ${r.id}
- UID: ${r.uid}
- Title: ${r.title}
- Description: ${r.description || "N/A"}
- Category: ${r.category}
- Standard: ${r.standard}
- Priority: ${r.priority}
- SIL: ${r.sil || "N/A"}
- Status: ${r.status}
`).join("\n")}

Recommend the top 1-3 most relevant requirements to link to this hazard.`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
              name: "recommend_requirement_links",
              description: "Return 1-3 recommended requirements to link to the hazard",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        requirement_id: { type: "string" },
                        requirement_uid: { type: "string" },
                        requirement_title: { type: "string" },
                        confidence: { type: "number", minimum: 0, maximum: 1 },
                        reasoning: { type: "string" }
                      },
                      required: ["requirement_id", "requirement_uid", "requirement_title", "confidence", "reasoning"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "recommend_requirement_links" } }
      }),
    });

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
        JSON.stringify({ recommendations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    return new Response(
      JSON.stringify({ 
        recommendations: result.recommendations || [],
        hazard: {
          id: hazard.id,
          uid: hazard.uid,
          title: hazard.title
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Error in recommend-requirement-links function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
