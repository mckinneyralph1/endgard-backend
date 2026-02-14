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

    const { project_id, standards, focus_areas } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch project data in parallel
    const [projectRes, hazardsRes, requirementsRes, testCasesRes, checklistRes, cesRes] = await Promise.all([
      supabase.from('projects').select('name, code, compliance_framework, primary_industry_id, safety_standard, target_date').eq('id', project_id).single(),
      supabase.from('hazards').select('uid, title, risk_level, status, mitigation, analysis_type, category').eq('project_id', project_id).limit(500),
      supabase.from('requirements').select('uid, title, status, sil_level, verification_method, standard_ref, control_strength').eq('project_id', project_id).limit(500),
      supabase.from('test_cases').select('uid, title, status, test_type, requirement_id').eq('project_id', project_id).limit(500),
      supabase.from('checklist_items').select('title, category, completed, phase_id').eq('project_id', project_id).limit(500),
      supabase.from('certifiable_elements').select('uid, name, type, status, sil_target').eq('project_id', project_id).limit(200),
    ]);

    const project = projectRes.data;
    const projectSummary = {
      name: project?.name,
      framework: project?.compliance_framework,
      standard: project?.safety_standard,
      hazard_count: hazardsRes.data?.length || 0,
      requirement_count: requirementsRes.data?.length || 0,
      test_count: testCasesRes.data?.length || 0,
      checklist_count: checklistRes.data?.length || 0,
      ce_count: cesRes.data?.length || 0,
    };

    // Build analysis context
    const analysisContext = {
      project: projectSummary,
      hazards: {
        by_risk: {
          critical: hazardsRes.data?.filter(h => h.risk_level === 'Critical').length || 0,
          high: hazardsRes.data?.filter(h => h.risk_level === 'High').length || 0,
          medium: hazardsRes.data?.filter(h => h.risk_level === 'Medium').length || 0,
          low: hazardsRes.data?.filter(h => h.risk_level === 'Low').length || 0,
        },
        by_status: {
          open: hazardsRes.data?.filter(h => h.status !== 'Closed').length || 0,
          closed: hazardsRes.data?.filter(h => h.status === 'Closed').length || 0,
        },
        without_mitigation: hazardsRes.data?.filter(h => !h.mitigation).map(h => ({ uid: h.uid, title: h.title, risk_level: h.risk_level })) || [],
        analysis_types_used: [...new Set(hazardsRes.data?.map(h => h.analysis_type).filter(Boolean) || [])],
      },
      requirements: {
        by_status: {
          draft: requirementsRes.data?.filter(r => r.status === 'Draft').length || 0,
          in_review: requirementsRes.data?.filter(r => r.status === 'In Review').length || 0,
          approved: requirementsRes.data?.filter(r => r.status === 'Approved').length || 0,
        },
        without_verification: requirementsRes.data?.filter(r => !r.verification_method).map(r => ({ uid: r.uid, title: r.title })).slice(0, 20) || [],
        sil_distribution: {
          sil4: requirementsRes.data?.filter(r => r.sil_level === 'SIL 4').length || 0,
          sil3: requirementsRes.data?.filter(r => r.sil_level === 'SIL 3').length || 0,
          sil2: requirementsRes.data?.filter(r => r.sil_level === 'SIL 2').length || 0,
          sil1: requirementsRes.data?.filter(r => r.sil_level === 'SIL 1').length || 0,
        },
      },
      testing: {
        by_status: {
          passed: testCasesRes.data?.filter(t => t.status === 'Passed').length || 0,
          failed: testCasesRes.data?.filter(t => t.status === 'Failed').length || 0,
          pending: testCasesRes.data?.filter(t => t.status === 'Pending').length || 0,
          not_executed: testCasesRes.data?.filter(t => t.status === 'Not Executed').length || 0,
        },
        orphan_tests: testCasesRes.data?.filter(t => !t.requirement_id).map(t => ({ uid: t.uid, title: t.title })).slice(0, 10) || [],
      },
      checklist: {
        total: checklistRes.data?.length || 0,
        completed: checklistRes.data?.filter(c => c.completed).length || 0,
        by_phase: Object.entries(
          (checklistRes.data || []).reduce((acc: Record<string, { total: number; completed: number }>, c) => {
            const phase = c.phase_id || 'unassigned';
            if (!acc[phase]) acc[phase] = { total: 0, completed: 0 };
            acc[phase].total++;
            if (c.completed) acc[phase].completed++;
            return acc;
          }, {})
        ),
      },
      certifiable_elements: {
        total: cesRes.data?.length || 0,
        by_status: {
          draft: cesRes.data?.filter(ce => ce.status === 'Draft').length || 0,
          in_review: cesRes.data?.filter(ce => ce.status === 'In Review').length || 0,
          approved: cesRes.data?.filter(ce => ce.status === 'Approved').length || 0,
        },
      },
    };

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const standardsList = standards?.length ? standards.join(', ') : project?.compliance_framework || 'general safety certification';
    const focusList = focus_areas?.length ? focus_areas.join(', ') : 'all areas';

    const systemPrompt = `You are a safety certification gap analysis expert. Analyze a project's current state against the specified standards and identify compliance gaps, missing evidence, and areas of concern.

For each gap found, provide:
- A clear title
- The severity (critical, major, minor, info)
- Which standard/requirement area it relates to
- A specific recommendation for remediation
- The affected entity type(s)

Be specific and actionable. Reference actual project data when pointing out gaps.`;

    const userPrompt = `Perform a gap analysis for this project against: ${standardsList}
Focus areas: ${focusList}

Project Data:
${JSON.stringify(analysisContext, null, 2)}

Identify all compliance gaps, missing evidence, and areas needing attention.`;

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
            name: 'return_gap_analysis',
            description: 'Return the gap analysis results',
            parameters: {
              type: 'object',
              properties: {
                summary: {
                  type: 'string',
                  description: 'Executive summary of overall compliance posture (2-3 sentences)',
                },
                overall_score: {
                  type: 'number',
                  description: 'Overall compliance readiness score from 0-100',
                },
                gaps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: 'Short identifier like GAP-001' },
                      title: { type: 'string' },
                      severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
                      category: { type: 'string', enum: ['hazard_analysis', 'requirements', 'testing', 'traceability', 'documentation', 'process', 'certification'] },
                      standard_ref: { type: 'string', description: 'Which standard clause this relates to' },
                      description: { type: 'string', description: 'Detailed description of the gap' },
                      recommendation: { type: 'string', description: 'Specific remediation steps' },
                      affected_entities: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'UIDs of affected entities if applicable',
                      },
                      effort_estimate: { type: 'string', enum: ['low', 'medium', 'high'] },
                    },
                    required: ['id', 'title', 'severity', 'category', 'description', 'recommendation'],
                  },
                },
                strengths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Areas where the project is well-covered',
                },
              },
              required: ['summary', 'overall_score', 'gaps', 'strengths'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_gap_analysis' } },
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
      return new Response(JSON.stringify({ error: 'Gap analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let analysis = { summary: '', overall_score: 0, gaps: [], strengths: [] };
    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error('Failed to parse gap analysis results');
      }
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Gap analysis error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
