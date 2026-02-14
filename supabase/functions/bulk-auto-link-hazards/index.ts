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
  RETRY_DELAY_MS: 1000,
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

interface Hazard {
  id: string;
  uid: string;
  title: string;
  description: string | null;
  severity: string;
  likelihood: string;
  risk_level: string;
  sil: string | null;
  mitigation: string | null;
  requirement_id: string | null;
}

interface Requirement {
  id: string;
  uid: string;
  title: string;
  description: string | null;
  category: string;
  standard: string;
  priority: string;
  sil: string | null;
  status: string;
}

interface LinkRecommendation {
  hazard_id: string;
  hazard_uid: string;
  hazard_title: string;
  requirement_id: string;
  requirement_uid: string;
  requirement_title: string;
  confidence: number;
  reasoning: string;
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

    const { projectId, onlyUnlinked = true } = await req.json();
    monitor.checkpoint('request_parsed');

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Missing projectId" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Bulk auto-link: Processing project ${projectId}, onlyUnlinked: ${onlyUnlinked}`);

    // Fetch hazards directly owned by this project
    let directHazardQuery = supabaseClient
      .from("hazards")
      .select("id, uid, title, description, severity, likelihood, risk_level, sil, mitigation, requirement_id")
      .eq("project_id", projectId);

    if (onlyUnlinked) {
      directHazardQuery = directHazardQuery.is("requirement_id", null);
    }

    const { data: directHazards, error: directHazardError } = await directHazardQuery;

    if (directHazardError) {
      console.error("Error fetching direct hazards:", directHazardError);
    }

    console.log(`Found ${directHazards?.length || 0} direct hazards`);

    // Fetch hazards linked via project_hazard_links (library hazards)
    const { data: linkedHazardLinks, error: linkedError } = await supabaseClient
      .from("project_hazard_links")
      .select("hazard_id")
      .eq("project_id", projectId);

    if (linkedError) {
      console.error("Error fetching linked hazards:", linkedError);
    }

    console.log(`Found ${linkedHazardLinks?.length || 0} linked hazard links`);

    let linkedHazards: Hazard[] = [];
    if (linkedHazardLinks && linkedHazardLinks.length > 0) {
      const linkedIds = linkedHazardLinks.map(l => l.hazard_id);
      
      let linkedQuery = supabaseClient
        .from("hazards")
        .select("id, uid, title, description, severity, likelihood, risk_level, sil, mitigation, requirement_id")
        .in("id", linkedIds);

      if (onlyUnlinked) {
        linkedQuery = linkedQuery.is("requirement_id", null);
      }

      const { data: linkedData, error: linkedDataError } = await linkedQuery;
      
      if (linkedDataError) {
        console.error("Error fetching linked hazard details:", linkedDataError);
      } else {
        linkedHazards = linkedData || [];
      }
    }

    console.log(`Found ${linkedHazards.length} linked hazards (after filtering)`);

    // Combine both sources, removing duplicates by id
    const allHazardsMap = new Map<string, Hazard>();
    
    (directHazards || []).forEach((h: Hazard) => allHazardsMap.set(h.id, h));
    linkedHazards.forEach((h: Hazard) => allHazardsMap.set(h.id, h));
    
    const hazards = Array.from(allHazardsMap.values());
    monitor.checkpoint('hazards_fetched');

    console.log(`Total unique hazards to process: ${hazards.length}`);

    if (hazards.length === 0) {
      return new Response(
        JSON.stringify({ 
          recommendations: [],
          message: onlyUnlinked ? "No unlinked hazards found" : "No hazards found"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch all requirements for the project
    const { data: requirements, error: reqError } = await supabaseClient
      .from("requirements")
      .select("id, uid, title, description, category, standard, priority, sil, status")
      .eq("project_id", projectId);

    if (reqError) {
      console.error("Error fetching requirements:", reqError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch requirements" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!requirements || requirements.length === 0) {
      return new Response(
        JSON.stringify({ 
          recommendations: [],
          message: "No requirements found to link"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${requirements.length} requirements available`);
    monitor.checkpoint('requirements_fetched');

    // Use OpenAI to analyze and recommend links for all hazards
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const systemPrompt = `You are a safety compliance expert analyzing hazards and requirements for a safety-critical project. Your task is to recommend the best requirement to link to each hazard based on content relevance, safety implications, and compliance needs.

For each hazard, find the most appropriate requirement based on:
- Semantic relevance between hazard and requirement descriptions
- Safety integrity levels (SIL) alignment
- Risk level and requirement priority correlation
- Technical domain overlap
- Compliance standard alignment

Only recommend high-confidence matches (70%+ confidence). If no good match exists for a hazard, skip it.`;

    const hazardsList = hazards.map((h: Hazard) => ({
      id: h.id,
      uid: h.uid,
      title: h.title,
      description: h.description || "N/A",
      severity: h.severity,
      likelihood: h.likelihood,
      risk_level: h.risk_level,
      sil: h.sil || "N/A"
    }));

    const requirementsList = requirements.map((r: Requirement) => ({
      id: r.id,
      uid: r.uid,
      title: r.title,
      description: r.description || "N/A",
      category: r.category,
      priority: r.priority,
      sil: r.sil || "N/A"
    }));

    const userPrompt = `Analyze these hazards and recommend the best requirement to link to each one.

HAZARDS TO PROCESS (${hazards.length} total):
${JSON.stringify(hazardsList, null, 2)}

AVAILABLE REQUIREMENTS (${requirements.length} total):
${JSON.stringify(requirementsList, null, 2)}

For each hazard that has a good match, provide a recommendation with the hazard ID, requirement ID, confidence score, and brief reasoning. Only include matches with 70%+ confidence.`;

    console.log("Calling AI for bulk analysis...");
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
                name: "bulk_link_recommendations",
                description: "Return recommended hazard-to-requirement links",
                parameters: {
                  type: "object",
                  properties: {
                    recommendations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          hazard_id: { type: "string" },
                          requirement_id: { type: "string" },
                          confidence: { type: "number", minimum: 0, maximum: 1 },
                          reasoning: { type: "string" }
                        },
                        required: ["hazard_id", "requirement_id", "confidence", "reasoning"],
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
          tool_choice: { type: "function", function: { name: "bulk_link_recommendations" } }
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
    console.log("AI response received");

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || !toolCall.function?.arguments) {
      console.log("No tool call in response");
      return new Response(
        JSON.stringify({ recommendations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);
    const rawRecommendations = result.recommendations || [];

    console.log(`AI returned ${rawRecommendations.length} recommendations`);

    // Enrich recommendations with full hazard and requirement details
    const enrichedRecommendations: LinkRecommendation[] = rawRecommendations
      .filter((rec: any) => rec.confidence >= 0.7)
      .map((rec: any) => {
        const hazard = hazards.find((h: Hazard) => h.id === rec.hazard_id);
        const requirement = requirements.find((r: Requirement) => r.id === rec.requirement_id);
        
        if (!hazard || !requirement) return null;
        
        return {
          hazard_id: hazard.id,
          hazard_uid: hazard.uid,
          hazard_title: hazard.title,
          requirement_id: requirement.id,
          requirement_uid: requirement.uid,
          requirement_title: requirement.title,
          confidence: rec.confidence,
          reasoning: rec.reasoning
        };
      })
      .filter(Boolean);

    monitor.checkpoint('complete');
    console.log(`Returning ${enrichedRecommendations.length} enriched recommendations. Performance: ${JSON.stringify(monitor.getSummary())}`);

    return new Response(
      JSON.stringify({ 
        recommendations: enrichedRecommendations,
        totalHazards: hazards.length,
        totalRequirements: requirements.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Error in bulk-auto-link-hazards function:", error);
    
    const errorMessage = error.message || "Internal server error";
    
    if (errorMessage.includes('abort')) {
      return new Response(
        JSON.stringify({ error: "Request timed out. Please try again with fewer hazards." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 504 }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
