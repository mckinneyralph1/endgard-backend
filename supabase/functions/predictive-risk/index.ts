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

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch comprehensive data for risk prediction
    const [hazardsRes, requirementsRes, testCasesRes, blockersRes, changeRequestsRes] = await Promise.all([
      supabase.from('hazards').select('id, uid, title, description, risk_level, status, mitigation, analysis_type, category, severity, likelihood, created_at, updated_at').eq('project_id', project_id).limit(500),
      supabase.from('requirements').select('id, uid, title, status, sil_level, verification_method, control_strength, created_at, updated_at').eq('project_id', project_id).limit(500),
      supabase.from('test_cases').select('id, uid, title, status, test_type, requirement_id, hazard_id, created_at, updated_at').eq('project_id', project_id).limit(500),
      supabase.from('project_blockers').select('id, title, status, priority, severity, created_at, resolved_at').eq('project_id', project_id).limit(100),
      supabase.from('change_requests').select('id, title, status, priority, created_at').eq('project_id', project_id).limit(100),
    ]);

    const analysisData = {
      hazards: (hazardsRes.data || []).map(h => ({
        uid: h.uid, title: h.title, risk_level: h.risk_level, status: h.status,
        has_mitigation: !!h.mitigation, analysis_type: h.analysis_type,
        severity: h.severity, likelihood: h.likelihood,
        age_days: Math.floor((Date.now() - new Date(h.created_at).getTime()) / 86400000),
        stale_days: Math.floor((Date.now() - new Date(h.updated_at).getTime()) / 86400000),
      })),
      requirements: (requirementsRes.data || []).map(r => ({
        uid: r.uid, title: r.title, status: r.status, sil_level: r.sil_level,
        has_verification: !!r.verification_method, control_strength: r.control_strength,
        age_days: Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000),
        stale_days: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000),
      })),
      test_cases: (testCasesRes.data || []).map(t => ({
        uid: t.uid, title: t.title, status: t.status, test_type: t.test_type,
        has_requirement: !!t.requirement_id, has_hazard: !!t.hazard_id,
      })),
      blockers: {
        open: (blockersRes.data || []).filter(b => b.status === 'open').length,
        critical: (blockersRes.data || []).filter(b => b.priority === 'critical' && b.status === 'open').length,
      },
      change_requests: {
        pending: (changeRequestsRes.data || []).filter(cr => cr.status === 'pending' || cr.status === 'in_review').length,
      },
    };

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `You are a predictive risk analyst for safety certification projects. Analyze project data to identify items most likely to cause certification delays, audit failures, or safety issues.

Consider factors like:
- Unmitigated high/critical hazards
- Stale items not updated recently
- Failed or unexecuted tests linked to critical hazards
- Requirements without verification methods
- Open blockers and pending change requests
- SIL level vs. evidence completeness mismatches

Score each at-risk item from 0-100 (higher = more likely to cause problems).`;

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
          { role: 'user', content: `Analyze this project data and predict risk items:\n${JSON.stringify(analysisData, null, 2)}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_risk_predictions',
            description: 'Return predicted risk items',
            parameters: {
              type: 'object',
              properties: {
                overall_risk_level: { type: 'string', enum: ['low', 'moderate', 'high', 'critical'] },
                overall_risk_summary: { type: 'string', description: '2-3 sentence risk summary' },
                predictions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      entity_type: { type: 'string', enum: ['hazard', 'requirement', 'test_case'] },
                      entity_uid: { type: 'string' },
                      entity_title: { type: 'string' },
                      risk_score: { type: 'number', description: '0-100 risk score' },
                      risk_factors: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of contributing risk factors',
                      },
                      recommended_action: { type: 'string' },
                      impact_if_ignored: { type: 'string', enum: ['certification_delay', 'audit_failure', 'safety_issue', 'rework_required'] },
                    },
                    required: ['entity_type', 'entity_uid', 'entity_title', 'risk_score', 'risk_factors', 'recommended_action', 'impact_if_ignored'],
                  },
                },
                risk_trends: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      trend: { type: 'string' },
                      direction: { type: 'string', enum: ['improving', 'stable', 'worsening'] },
                      detail: { type: 'string' },
                    },
                    required: ['trend', 'direction', 'detail'],
                  },
                },
              },
              required: ['overall_risk_level', 'overall_risk_summary', 'predictions', 'risk_trends'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_risk_predictions' } },
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
      return new Response(JSON.stringify({ error: 'Risk prediction failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let predictions = { overall_risk_level: 'low', overall_risk_summary: '', predictions: [], risk_trends: [] };
    if (toolCall?.function?.arguments) {
      try {
        predictions = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error('Failed to parse risk predictions');
      }
    }

    return new Response(JSON.stringify(predictions), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Predictive risk error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
