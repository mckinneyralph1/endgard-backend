import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { query, project_id } = await req.json();
    if (!query || !project_id) {
      return new Response(JSON.stringify({ error: 'query and project_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch all entity data for the project in parallel
    const [hazardsRes, requirementsRes, testCasesRes, checklistRes, cesRes, designRecordsRes] = await Promise.all([
      supabase.from('hazards').select('id, uid, title, description, risk_level, status, mitigation, category, analysis_type').eq('project_id', project_id).limit(500),
      supabase.from('requirements').select('id, uid, title, description, status, sil_level, verification_method, ce_id').eq('project_id', project_id).limit(500),
      supabase.from('test_cases').select('id, uid, title, description, status, test_type, expected_result').eq('project_id', project_id).limit(500),
      supabase.from('checklist_items').select('id, title, description, category, completed, phase_id').eq('project_id', project_id).limit(500),
      supabase.from('certifiable_elements').select('id, uid, name, description, type, status, sil_target').eq('project_id', project_id).limit(200),
      supabase.from('design_records').select('id, uid, title, description, status, design_approach, verification_method').eq('project_id', project_id).limit(200),
    ]);

    // Build a condensed index for the AI
    const entityIndex: Record<string, any[]> = {};

    if (hazardsRes.data?.length) {
      entityIndex.hazards = hazardsRes.data.map(h => ({
        id: h.id, uid: h.uid, title: h.title,
        description: (h.description || '').slice(0, 200),
        risk_level: h.risk_level, status: h.status,
        category: h.category, analysis_type: h.analysis_type,
        mitigation: (h.mitigation || '').slice(0, 150),
      }));
    }

    if (requirementsRes.data?.length) {
      entityIndex.requirements = requirementsRes.data.map(r => ({
        id: r.id, uid: r.uid, title: r.title,
        description: (r.description || '').slice(0, 200),
        status: r.status, sil_level: r.sil_level,
        verification_method: r.verification_method,
      }));
    }

    if (testCasesRes.data?.length) {
      entityIndex.test_cases = testCasesRes.data.map(t => ({
        id: t.id, uid: t.uid, title: t.title,
        description: (t.description || '').slice(0, 200),
        status: t.status, test_type: t.test_type,
      }));
    }

    if (checklistRes.data?.length) {
      entityIndex.checklist_items = checklistRes.data.map(c => ({
        id: c.id, title: c.title,
        description: (c.description || '').slice(0, 150),
        category: c.category, completed: c.completed,
      }));
    }

    if (cesRes.data?.length) {
      entityIndex.certifiable_elements = cesRes.data.map(ce => ({
        id: ce.id, uid: ce.uid, name: ce.name,
        description: (ce.description || '').slice(0, 200),
        type: ce.type, status: ce.status, sil_target: ce.sil_target,
      }));
    }

    if (designRecordsRes.data?.length) {
      entityIndex.design_records = designRecordsRes.data.map(dr => ({
        id: dr.id, uid: dr.uid, title: dr.title,
        description: (dr.description || '').slice(0, 200),
        status: dr.status,
      }));
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `You are a safety certification project search assistant. You are given a database of project entities and a user's natural language query. Your job is to find and return the most relevant matches.

Return a JSON array of results. Each result must have:
- "entity_type": one of "hazard", "requirement", "test_case", "checklist_item", "certifiable_element", "design_record"
- "id": the entity's id
- "uid": the entity's uid (if available, otherwise null)
- "title": the entity's title or name
- "relevance": a brief explanation of why this matches (1 sentence)
- "score": relevance score 0-100

Return at most 15 results, sorted by score descending. Only include items with score >= 30.
If nothing matches, return an empty array.`;

    const userPrompt = `Search query: "${query}"

Project entities:
${JSON.stringify(entityIndex, null, 1)}`;

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
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_search_results',
            description: 'Return the search results',
            parameters: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      entity_type: { type: 'string', enum: ['hazard', 'requirement', 'test_case', 'checklist_item', 'certifiable_element', 'design_record'] },
                      id: { type: 'string' },
                      uid: { type: 'string' },
                      title: { type: 'string' },
                      relevance: { type: 'string' },
                      score: { type: 'number' },
                    },
                    required: ['entity_type', 'id', 'title', 'relevance', 'score'],
                  },
                },
              },
              required: ['results'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_search_results' } },
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
      return new Response(JSON.stringify({ error: 'AI search failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let results: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        results = parsed.results || [];
      } catch {
        console.error('Failed to parse AI results');
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('NL search error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
