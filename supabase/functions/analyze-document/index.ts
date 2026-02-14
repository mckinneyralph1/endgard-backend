import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resilience configuration
const CONFIG = {
  AI_TIMEOUT_MS: 120000, // 2 min for large documents
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  MAX_CHARS: 600000,
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentText, projectId, analysisType, sourceDocumentId, sourceExternalUrl } = await req.json();
    monitor.checkpoint('request_parsed');
    
    // Validate required fields
    if (!documentText || !projectId || !analysisType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: documentText, projectId, analysisType' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Analyzing document for project:", projectId, "type:", analysisType);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Truncate document to avoid token limits
    let processedText = documentText;
    let wasTruncated = false;
    
    if (documentText.length > CONFIG.MAX_CHARS) {
      wasTruncated = true;
      const chunkSize = Math.floor(CONFIG.MAX_CHARS / 2);
      processedText = documentText.substring(0, chunkSize) + 
        "\n\n... [document truncated due to size] ...\n\n" +
        documentText.substring(documentText.length - chunkSize);
      console.log(`Document truncated from ${documentText.length} to ${processedText.length} characters`);
    }

    // Create Supabase client for project history analysis
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch project history for context
    const [{ data: existingHazards }, { data: existingChecklist }, { data: existingTestCases }] = await Promise.all([
      supabase.from("hazards").select("title, description, severity, likelihood, mitigation").eq("project_id", projectId).limit(10),
      supabase.from("checklist_items").select("title, description, category").eq("project_id", projectId).limit(10),
      supabase.from("test_cases").select("uid, title, description, test_type").eq("project_id", projectId).limit(10),
    ]);
    
    monitor.checkpoint('context_fetched');

    let systemPrompt = "";
    let extractionSchema: any = {};

    // Common source reference fields for all item types
    const sourceRefProperties = {
      source_page: { 
        type: "string", 
        description: "Page number or range where this item was found (e.g., '42', '15-18')" 
      },
      source_section: { 
        type: "string", 
        description: "Section reference where this item was found (e.g., '4.3.2', 'Appendix A')" 
      },
      source_quote: { 
        type: "string", 
        description: "Brief quote from the source document supporting this item" 
      },
    };

    if (analysisType === "hazards") {
      systemPrompt = `You are a safety analysis expert. Analyze the provided document and extract all potential hazards.
      
Context from previous projects:
${existingHazards?.map((h) => `- ${h.title}: ${h.description}`).join("\n") || "No previous hazards"}

Extract:
- Unique identifier (UID format: HAZ-XXX)
- Title (concise hazard name)
- Description (detailed explanation)
- Severity (catastrophic, critical, marginal, negligible)
- Likelihood (frequent, probable, occasional, remote, improbable)
- Mitigation strategies
- Source location (page number, section, and a brief supporting quote if available)

Return a JSON array of hazards with source references.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_hazards",
          description: "Extract safety hazards from the document with source references",
          parameters: {
            type: "object",
            properties: {
              hazards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    severity: {
                      type: "string",
                      enum: ["catastrophic", "critical", "marginal", "negligible"],
                    },
                    likelihood: {
                      type: "string",
                      enum: ["frequent", "probable", "occasional", "remote", "improbable"],
                    },
                    mitigation: { type: "string" },
                    ...sourceRefProperties,
                  },
                  required: ["uid", "title", "description", "severity", "likelihood"],
                },
              },
            },
            required: ["hazards"],
          },
        },
      };
    } else if (analysisType === "checklist") {
      systemPrompt = `You are a project compliance expert. Analyze the provided document and extract checklist items.

Context from previous projects:
${existingChecklist?.map((c) => `- ${c.title} (${c.category})`).join("\n") || "No previous checklist items"}

Extract:
- Title (clear, actionable item)
- Description (what needs to be done)
- Category (compliance, testing, documentation, design, validation, safety)
- Source location (page number, section, and a brief supporting quote if available)

Return a JSON array of checklist items with source references.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_checklist",
          description: "Extract checklist items from the document with source references",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    category: {
                      type: "string",
                      enum: ["compliance", "testing", "documentation", "design", "validation", "safety"],
                    },
                    ...sourceRefProperties,
                  },
                  required: ["title", "description", "category"],
                },
              },
            },
            required: ["items"],
          },
        },
      };
    } else if (analysisType === "requirements") {
      systemPrompt = `You are a transportation systems requirements engineer. Analyze the provided document and extract formal requirements.

Extract well-formed requirements that follow industry best practices:
- UID (format: REQ-XXX, SYS-XXX, SAF-XXX)
- Title (brief summary)
- Text (complete requirement statement using "shall" language)
- SIL (Safety Integrity Level 0-4, only for safety-critical requirements)
- Standards (applicable standard like EN 50126, FTA SMS, IEEE 1474.1, etc.)
- Source location (page number, section, and a brief supporting quote if available)

Focus on:
- Functional requirements (system capabilities)
- Safety requirements (safety-critical functions)
- Performance requirements (timing, accuracy)
- Interface requirements
- Compliance requirements

Return a JSON array of requirements with source references.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_requirements",
          description: "Extract requirements from the document with source references",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    title: { type: "string" },
                    text: { type: "string" },
                    sil: { 
                      type: "integer",
                      minimum: 0,
                      maximum: 4,
                      description: "Safety Integrity Level (0-4), omit if not safety-related"
                    },
                    standards: { 
                      type: "string",
                      description: "Applicable standard (e.g., EN 50126, FTA SMS)"
                    },
                    ...sourceRefProperties,
                  },
                  required: ["uid", "title", "text"],
                },
              },
            },
            required: ["items"],
          },
        },
      };
    } else if (analysisType === "test_cases") {
      systemPrompt = `You are a test engineering expert. Analyze the provided document and extract test cases.

Context from previous projects:
${existingTestCases?.map((t) => `- ${t.uid}: ${t.title} (${t.test_type})`).join("\n") || "No previous test cases"}

Extract:
- UID (format: TC-XXX)
- Title (brief test description)
- Description (detailed test objective and scope)
- Test type (unit, integration, system, acceptance)
- Source location (page number, section, and a brief supporting quote if available)

Return a JSON array of test cases with source references.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_test_cases",
          description: "Extract test cases from the document with source references",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    test_type: {
                      type: "string",
                      enum: ["unit", "integration", "system", "acceptance"],
                    },
                    ...sourceRefProperties,
                  },
                  required: ["uid", "title", "test_type"],
                },
              },
            },
            required: ["items"],
          },
        },
      };
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid analysis type. Must be: hazards, checklist, requirements, or test_cases" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling AI gateway for analysis...");
    monitor.checkpoint('ai_call_start');

    const response = await fetchWithTimeout(
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
            { role: "user", content: processedText },
          ],
          tools: [extractionSchema],
          tool_choice: { type: "function", function: { name: extractionSchema.function.name } },
        }),
      },
      CONFIG.AI_TIMEOUT_MS
    );

    monitor.checkpoint('ai_response');

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 400 && errorText.includes("maximum context length")) {
        return new Response(
          JSON.stringify({ 
            error: "Document is too large to analyze. Please try with a smaller document or split it into multiple sections.",
            details: "The document exceeds the AI model's token limit even after truncation."
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI analysis complete");

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    // Add source document reference to all extracted items if provided
    const addSourceRef = (items: any[]) => items.map(item => ({
      ...item,
      source_document_id: sourceDocumentId || null,
      source_external_url: sourceExternalUrl || null,
    }));

    // Apply source reference to extracted items
    if (extractedData.hazards) {
      extractedData.hazards = addSourceRef(extractedData.hazards);
    }
    if (extractedData.items) {
      extractedData.items = addSourceRef(extractedData.items);
    }

    // Include truncation warning in response if applicable
    const responseData = {
      ...extractedData,
      ...(wasTruncated && { 
        warning: "Document was truncated due to size. Some content from the middle may not have been analyzed."
      })
    };

    monitor.checkpoint('complete');
    console.log(`Document analysis complete. Performance: ${JSON.stringify(monitor.getSummary())}`);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-document:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes('abort')) {
      return new Response(
        JSON.stringify({ error: "Request timed out. The document may be too large. Please try with a smaller document." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
