import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resilience configuration
const CONFIG = {
  AI_TIMEOUT_MS: 60000,
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

// Retry wrapper
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

serve(async (req) => {
  const monitor = new PerformanceMonitor();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { changeRequest, projectData } = await req.json();
    monitor.checkpoint('request_parsed');
    
    // Validate required fields
    if (!changeRequest?.title) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: changeRequest.title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log("Analyzing change impact for:", changeRequest.title);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const systemPrompt = `You are a requirements management expert specializing in impact analysis for safety-critical systems. 
Analyze the proposed change and identify which existing items (requirements, hazards, test cases, certifiable elements) would be affected.

For each affected item, provide:
- item_type: "requirement" | "hazard" | "test_case" | "certifiable_element"
- item_id: the ID of the affected item
- item_title: the title/name of the affected item
- impact_type: "direct" | "indirect" | "dependency"
- severity: "low" | "medium" | "high" | "critical"
- description: brief explanation of the impact

Also provide a summary of the overall impact assessment.`;

    const userPrompt = `Analyze the impact of this proposed change:

**Change Request:**
Title: ${changeRequest.title}
Description: ${changeRequest.description || 'No description provided'}

**Project Data:**

Requirements (${projectData.requirements?.length || 0}):
${JSON.stringify(projectData.requirements?.slice(0, 30) || [], null, 2)}

Hazards (${projectData.hazards?.length || 0}):
${JSON.stringify(projectData.hazards?.slice(0, 30) || [], null, 2)}

Test Cases (${projectData.testCases?.length || 0}):
${JSON.stringify(projectData.testCases?.slice(0, 30) || [], null, 2)}

Certifiable Elements (${projectData.certifiableElements?.length || 0}):
${JSON.stringify(projectData.certifiableElements?.slice(0, 20) || [], null, 2)}

Return a JSON object with:
{
  "impacts": [array of impact objects],
  "summary": "overall impact summary"
}`;

    monitor.checkpoint('prompt_prepared');

    const callAI = async () => {
      const response = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
          }),
        },
        CONFIG.AI_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 429) {
          throw new Error('RATE_LIMIT');
        }
        if (response.status === 402) {
          throw new Error('CREDITS_EXHAUSTED');
        }
        
        console.error("AI API error:", errorText);
        throw new Error(`AI API error: ${response.status}`);
      }

      return response.json();
    };

    const aiResult = await withRetry(callAI, CONFIG.MAX_RETRIES, CONFIG.RETRY_DELAY_MS);
    monitor.checkpoint('ai_response');
    
    const content = aiResult.choices?.[0]?.message?.content;
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      result = { impacts: [], summary: "Unable to analyze impacts automatically. Manual review recommended." };
    }

    monitor.checkpoint('complete');
    console.log(`Impact analysis complete: ${result.impacts?.length || 0} impacts identified. Performance: ${JSON.stringify(monitor.getSummary())}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error("Error in analyze-change-impact:", error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle specific error types
    if (errorMessage === 'RATE_LIMIT') {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', impacts: [], summary: '' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (errorMessage === 'CREDITS_EXHAUSTED') {
      return new Response(
        JSON.stringify({ error: 'AI credits exhausted. Please add credits.', impacts: [], summary: '' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (errorMessage.includes('abort')) {
      return new Response(
        JSON.stringify({ error: 'Request timed out. Please try again.', impacts: [], summary: '' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      impacts: [],
      summary: "Impact analysis failed. Please review manually."
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
