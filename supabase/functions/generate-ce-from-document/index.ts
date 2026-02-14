import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, documentContent, standardName, standardCode } = await req.json();
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Generating CEs from document:', { documentId, standardName, standardCode });

    const systemPrompt = `You are an expert safety systems engineer specializing in safety certification and compliance. Your task is to analyze safety standards documents and extract a hierarchical structure of Certifiable Elements (CEs) that would be required for compliance.

A Certifiable Element (CE) is a component, subsystem, or system that requires safety certification. CEs should be organized hierarchically with:
- Top-level systems
- Sub-systems within those systems
- Components within sub-systems

For each CE, provide:
- uid: A unique identifier (e.g., "CE-001", "CE-001.1", "CE-001.1.1")
- name: A descriptive name
- type: One of "system", "subsystem", or "component"
- description: A brief description of what this element covers
- sil_target: Suggested SIL level if applicable (SIL1, SIL2, SIL3, SIL4, or null)
- parent_uid: The UID of the parent element (null for top-level)`;

    const userPrompt = `Analyze the following safety standard document and generate a comprehensive hierarchical list of Certifiable Elements (CEs) that would typically be required for compliance with this standard.

Standard: ${standardName} (${standardCode})

Document Content:
${documentContent || 'No specific content provided - generate typical CEs for this type of standard.'}

Please return a JSON array of certifiable elements with the structure described. Focus on practical, actionable elements that a safety certification project would need to track.`;

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
              name: 'generate_certifiable_elements',
              description: 'Generate a list of certifiable elements from a safety standard document',
              parameters: {
                type: 'object',
                properties: {
                  elements: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        uid: { type: 'string', description: 'Unique identifier like CE-001, CE-001.1' },
                        name: { type: 'string', description: 'Descriptive name of the element' },
                        type: { type: 'string', enum: ['system', 'subsystem', 'component'] },
                        description: { type: 'string', description: 'Brief description' },
                        sil_target: { type: 'string', enum: ['SIL1', 'SIL2', 'SIL3', 'SIL4', null], nullable: true },
                        parent_uid: { type: 'string', nullable: true, description: 'Parent element UID or null for top-level' }
                      },
                      required: ['uid', 'name', 'type', 'description']
                    }
                  },
                  summary: {
                    type: 'string',
                    description: 'Brief summary of the generated CE structure'
                  }
                },
                required: ['elements', 'summary']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'generate_certifiable_elements' } }
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
    if (!toolCall || toolCall.function.name !== 'generate_certifiable_elements') {
      throw new Error('Invalid AI response format');
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log('Generated', result.elements?.length || 0, 'certifiable elements');

    return new Response(JSON.stringify({
      success: true,
      elements: result.elements,
      summary: result.summary
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-ce-from-document:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to generate CEs' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
