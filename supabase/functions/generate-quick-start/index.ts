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

interface QuickStartInput {
  projectName: string;
  industry: string;
  industryId: string;
  systemType: string;
  framework: string;
  silLevel: string;
  subsystems: string[];
  projectPhase: string;
  criticalityFocus: string;
}

serve(async (req) => {
  const monitor = new PerformanceMonitor();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input: QuickStartInput = await req.json();
    monitor.checkpoint('request_parsed');
    
    // Validate required fields
    if (!input.projectName || !input.industry) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: projectName, industry' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log("Quick Start input:", input);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert safety engineer specializing in transportation safety certification. 
You generate comprehensive safety certification artifacts for ${input.industry} projects.
You understand regulatory frameworks like FTA, APTA, EN 50129, EN 50126, and their requirements.
Generate realistic, industry-standard content that would be used in actual safety certification projects.`;

    // Generate CEs
    const cePrompt = `Generate a hierarchical list of Certifiable Elements (CEs) for:
Project: ${input.projectName}
Industry: ${input.industry}
System Type: ${input.systemType}
Subsystems: ${input.subsystems.join(', ')}
SIL Level: ${input.silLevel}

Generate 3-5 top-level systems with 2-4 subsystems each. Include realistic UIDs, names, types (System/Subsystem/Component), and descriptions.`;

    console.log("Generating CEs...");
    monitor.checkpoint('ce_start');
    
    const ceResponse = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: cePrompt }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'generate_certifiable_elements',
              description: 'Generate hierarchical certifiable elements',
              parameters: {
                type: 'object',
                properties: {
                  elements: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        uid: { type: 'string' },
                        name: { type: 'string' },
                        type: { type: 'string', enum: ['System', 'Subsystem', 'Component'] },
                        description: { type: 'string' },
                        sil_target: { type: 'string' },
                        parent_uid: { type: 'string' }
                      },
                      required: ['uid', 'name', 'type', 'description']
                    }
                  }
                },
                required: ['elements']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'generate_certifiable_elements' } }
        }),
      },
      CONFIG.AI_TIMEOUT_MS
    );

    if (!ceResponse.ok) {
      const errorText = await ceResponse.text();
      console.error("CE generation error:", errorText);
      if (ceResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (ceResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`CE generation failed: ${errorText}`);
    }

    const ceData = await ceResponse.json();
    const ceToolCall = ceData.choices?.[0]?.message?.tool_calls?.[0];
    const certifiableElements = ceToolCall ? JSON.parse(ceToolCall.function.arguments).elements : [];
    console.log("Generated CEs:", certifiableElements.length);
    monitor.checkpoint('ce_complete');

    // Generate Hazards
    const hazardPrompt = `Generate hazards for a ${input.industry} ${input.systemType} project.
Framework: ${input.framework}
Criticality Focus: ${input.criticalityFocus}
Subsystems: ${input.subsystems.join(', ')}
SIL Level: ${input.silLevel}

Generate 8-12 realistic hazards with varying severity levels (Catastrophic, Critical, Moderate, Minor) and likelihood (Frequent, Probable, Occasional, Remote, Improbable).
Include appropriate analysis types (SHA, SSHA, FMECA, O&SHA).
Provide mitigation strategies for each hazard.`;

    const hazardResponse = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: hazardPrompt }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'generate_hazards',
              description: 'Generate safety hazards with risk assessment',
              parameters: {
                type: 'object',
                properties: {
                  hazards: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        uid: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        severity: { type: 'string', enum: ['Catastrophic', 'Critical', 'Moderate', 'Minor', 'Negligible'] },
                        likelihood: { type: 'string', enum: ['Frequent', 'Probable', 'Occasional', 'Remote', 'Improbable'] },
                        risk_level: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
                        analysis_type: { type: 'string', enum: ['SHA', 'SSHA', 'FMECA', 'O&SHA', 'General'] },
                        mitigation: { type: 'string' },
                        sil: { type: 'string' }
                      },
                      required: ['uid', 'title', 'description', 'severity', 'likelihood', 'risk_level']
                    }
                  }
                },
                required: ['hazards']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'generate_hazards' } }
        }),
      },
      CONFIG.AI_TIMEOUT_MS
    );

    if (!hazardResponse.ok) {
      const errorText = await hazardResponse.text();
      console.error("Hazard generation error:", errorText);
      throw new Error(`Hazard generation failed: ${errorText}`);
    }

    const hazardData = await hazardResponse.json();
    const hazardToolCall = hazardData.choices?.[0]?.message?.tool_calls?.[0];
    const hazards = hazardToolCall ? JSON.parse(hazardToolCall.function.arguments).hazards : [];
    console.log("Generated hazards:", hazards.length);
    monitor.checkpoint('hazards_complete');

    // Generate Requirements
    const reqPrompt = `Generate safety requirements for a ${input.industry} ${input.systemType} project.
Framework: ${input.framework}
SIL Level: ${input.silLevel}
Subsystems: ${input.subsystems.join(', ')}

Generate 10-15 requirements covering:
- Safety requirements
- Performance requirements  
- Design requirements
- Verification requirements

Include standard references (e.g., FTA 5046, EN 50129 clause numbers).
Categorize by: Safety, Performance, Interface, Environmental, Verification.
Set appropriate priority levels (High, Medium, Low).`;

    const reqResponse = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: reqPrompt }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'generate_requirements',
              description: 'Generate safety and compliance requirements',
              parameters: {
                type: 'object',
                properties: {
                  requirements: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        uid: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        standard: { type: 'string' },
                        category: { type: 'string', enum: ['Safety', 'Performance', 'Interface', 'Environmental', 'Verification'] },
                        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
                        verification_method: { type: 'string', enum: ['Test', 'Analysis', 'Inspection', 'Demonstration'] },
                        sil: { type: 'string' }
                      },
                      required: ['uid', 'title', 'description', 'standard', 'category', 'priority']
                    }
                  }
                },
                required: ['requirements']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'generate_requirements' } }
        }),
      },
      CONFIG.AI_TIMEOUT_MS
    );

    if (!reqResponse.ok) {
      const errorText = await reqResponse.text();
      console.error("Requirements generation error:", errorText);
      throw new Error(`Requirements generation failed: ${errorText}`);
    }

    const reqData = await reqResponse.json();
    const reqToolCall = reqData.choices?.[0]?.message?.tool_calls?.[0];
    const requirements = reqToolCall ? JSON.parse(reqToolCall.function.arguments).requirements : [];
    console.log("Generated requirements:", requirements.length);
    monitor.checkpoint('requirements_complete');

    // Generate Test Cases
    const testPrompt = `Generate test cases for a ${input.industry} ${input.systemType} safety certification project.
Framework: ${input.framework}
SIL Level: ${input.silLevel}

Generate 6-10 test cases covering:
- Unit tests
- Integration tests
- System tests
- Acceptance tests

Each test should verify specific safety or performance requirements.`;

    const testResponse = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: testPrompt }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'generate_test_cases',
              description: 'Generate verification test cases',
              parameters: {
                type: 'object',
                properties: {
                  test_cases: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        uid: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        test_type: { type: 'string', enum: ['Unit', 'Integration', 'System', 'Acceptance'] }
                      },
                      required: ['uid', 'title', 'description', 'test_type']
                    }
                  }
                },
                required: ['test_cases']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'generate_test_cases' } }
        }),
      },
      CONFIG.AI_TIMEOUT_MS
    );

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error("Test case generation error:", errorText);
      throw new Error(`Test case generation failed: ${errorText}`);
    }

    const testData = await testResponse.json();
    const testToolCall = testData.choices?.[0]?.message?.tool_calls?.[0];
    const testCases = testToolCall ? JSON.parse(testToolCall.function.arguments).test_cases : [];
    console.log("Generated test cases:", testCases.length);
    monitor.checkpoint('complete');
    
    console.log(`Quick start complete. Performance: ${JSON.stringify(monitor.getSummary())}`);

    return new Response(JSON.stringify({
      certifiableElements,
      hazards,
      requirements,
      testCases,
      summary: {
        totalCEs: certifiableElements.length,
        totalHazards: hazards.length,
        totalRequirements: requirements.length,
        totalTestCases: testCases.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Quick Start generation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (errorMessage.includes('abort')) {
      return new Response(JSON.stringify({ error: 'Request timed out. Please try again.' }), {
        status: 504,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
