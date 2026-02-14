import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentContent, documentName, projectName, industry } = await req.json();
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Extracting system definition from document:', { documentName, projectName, industry });

    const systemPrompt = `You are an expert safety systems engineer specializing in extracting system definition information from contract documents, technical specifications, and project documentation for safety certification projects.

Your task is to analyze the provided document and extract structured system definition information that would be used in a Safety and Security Certification Plan (SSCP).

Focus on extracting:
1. System identification and scope
2. System boundaries and architecture
3. Operating environment and conditions
4. Safety objectives and targets
5. Concept of operations
6. Assumptions and constraints

Be thorough but practical. If information is not explicitly stated, make reasonable inferences based on the document context and industry standards. Mark inferred content appropriately.`;

    const userPrompt = `Analyze the following document and extract system definition information for a safety certification project.

${projectName ? `Project: ${projectName}` : ''}
${industry ? `Industry: ${industry}` : ''}
${documentName ? `Document: ${documentName}` : ''}

Document Content:
${documentContent}

Extract all relevant system definition information and structure it appropriately. For fields where information is inferred rather than explicitly stated, add "[Inferred]" prefix to indicate this.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_system_definition',
              description: 'Extract system definition information from a document',
              parameters: {
                type: 'object',
                properties: {
                  system_name: { 
                    type: 'string', 
                    description: 'Name of the system being certified' 
                  },
                  system_description: { 
                    type: 'string', 
                    description: 'Brief description of the system purpose and function' 
                  },
                  scope_statement: { 
                    type: 'string', 
                    description: 'What is included in the certification scope' 
                  },
                  system_boundaries: { 
                    type: 'string', 
                    description: 'Physical and functional boundaries of the system' 
                  },
                  excluded_items: { 
                    type: 'string', 
                    description: 'Items explicitly excluded from certification scope' 
                  },
                  architecture_overview: { 
                    type: 'string', 
                    description: 'High-level system architecture and major components' 
                  },
                  operating_environment: { 
                    type: 'string', 
                    description: 'Operational environment where system will be deployed' 
                  },
                  temperature_range: { 
                    type: 'string', 
                    description: 'Operating temperature range' 
                  },
                  environmental_conditions: { 
                    type: 'string', 
                    description: 'Environmental requirements (humidity, vibration, EMI, etc.)' 
                  },
                  safety_objectives: { 
                    type: 'string', 
                    description: 'Top-level safety objectives for the system' 
                  },
                  tolerable_hazard_rate: { 
                    type: 'string', 
                    description: 'Target hazard rate (THR) if specified' 
                  },
                  target_sil: { 
                    type: 'string', 
                    enum: ['SIL 0', 'SIL 1', 'SIL 2', 'SIL 3', 'SIL 4'],
                    description: 'Target Safety Integrity Level' 
                  },
                  concept_of_operations: { 
                    type: 'string', 
                    description: 'High-level description of system operation' 
                  },
                  normal_operations: { 
                    type: 'string', 
                    description: 'Typical operating scenarios and procedures' 
                  },
                  degraded_modes: { 
                    type: 'string', 
                    description: 'Operations during component failures or reduced capability' 
                  },
                  emergency_procedures: { 
                    type: 'string', 
                    description: 'Emergency response and safe state procedures' 
                  },
                  assumptions: { 
                    type: 'string', 
                    description: 'Key assumptions underlying the safety case' 
                  },
                  constraints: { 
                    type: 'string', 
                    description: 'Technical, regulatory, or organizational constraints' 
                  },
                  extraction_summary: {
                    type: 'string',
                    description: 'Summary of what was extracted and any notable gaps'
                  },
                  confidence_level: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description: 'Confidence in extraction quality based on document content'
                  }
                },
                required: ['system_name', 'extraction_summary', 'confidence_level']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_system_definition' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_system_definition') {
      throw new Error('Invalid AI response format');
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log('Extracted system definition with confidence:', result.confidence_level);

    return new Response(JSON.stringify({
      success: true,
      data: result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in extract-system-definition:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to extract system definition' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
