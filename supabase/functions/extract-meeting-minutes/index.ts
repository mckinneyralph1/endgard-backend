import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { text, project_id } = await req.json();
    if (!text || !project_id) {
      return new Response(JSON.stringify({ error: 'text and project_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Limit input size
    const truncatedText = text.slice(0, 15000);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `You are a safety certification meeting minutes analyst. Extract structured items from meeting minutes text.

Extract:
1. Action items — who, what, deadline
2. Decisions — what was decided
3. Hazards/risks mentioned — potential hazards discussed
4. Requirements discussed — any safety requirements mentioned
5. Open questions — unresolved items

Be thorough but only extract items that are clearly stated or strongly implied.`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract items from these meeting minutes:\n\n${truncatedText}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_extracted_items',
            description: 'Return the extracted meeting items',
            parameters: {
              type: 'object',
              properties: {
                meeting_summary: { type: 'string', description: 'Brief 1-2 sentence summary of the meeting' },
                meeting_date: { type: 'string', description: 'Detected meeting date if present, or null' },
                action_items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      assignee: { type: 'string' },
                      deadline: { type: 'string' },
                      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                      category: { type: 'string', enum: ['hazard', 'requirement', 'testing', 'documentation', 'process', 'general'] },
                    },
                    required: ['description', 'priority', 'category'],
                  },
                },
                decisions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      decision: { type: 'string' },
                      rationale: { type: 'string' },
                      impact_area: { type: 'string' },
                    },
                    required: ['decision'],
                  },
                },
                hazards_mentioned: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      suggested_risk_level: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
                      suggested_category: { type: 'string' },
                    },
                    required: ['title', 'description', 'suggested_risk_level'],
                  },
                },
                requirements_discussed: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      suggested_sil: { type: 'string' },
                    },
                    required: ['title', 'description'],
                  },
                },
                open_questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question: { type: 'string' },
                      context: { type: 'string' },
                      owner: { type: 'string' },
                    },
                    required: ['question'],
                  },
                },
              },
              required: ['meeting_summary', 'action_items', 'decisions', 'hazards_mentioned', 'requirements_discussed', 'open_questions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_extracted_items' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI usage limit reached. Please add credits.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const errText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Meeting extraction failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let extracted = {
      meeting_summary: '',
      meeting_date: null,
      action_items: [],
      decisions: [],
      hazards_mentioned: [],
      requirements_discussed: [],
      open_questions: [],
    };

    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error('Failed to parse extraction results');
      }
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Meeting extraction error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
