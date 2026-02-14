import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TraceabilityRequest {
  workflowId: string;
  stepId: string;
  projectId: string;
}

interface TraceabilityLink {
  hazard_uid: string;
  hazard_title: string;
  requirement_uid: string;
  requirement_title: string;
  ce_uid?: string;
  ce_name?: string;
  link_rationale: string;
  confidence: number;
  verification_method: 'analysis' | 'inspection' | 'demonstration' | 'test';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { workflowId, stepId, projectId } = await req.json() as TraceabilityRequest;
    console.log(`Building traceability for workflow ${workflowId}, project ${projectId}`);

    // Update step to running
    await supabase
      .from('ai_workflow_steps')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', stepId);

    // Fetch all project data
    const [hazardsResult, requirementsResult, cesResult] = await Promise.all([
      supabase.from('hazards').select('id, uid, title, description, severity, likelihood, sil, ce_id, requirement_id').eq('project_id', projectId),
      supabase.from('requirements').select('id, uid, title, description, category, priority, verification_method, sil').eq('project_id', projectId),
      supabase.from('certifiable_elements').select('id, uid, name, description, type, sil_target').eq('project_id', projectId),
    ]);

    const hazards = hazardsResult.data || [];
    const requirements = requirementsResult.data || [];
    const ces = cesResult.data || [];

    console.log(`Found ${hazards.length} hazards, ${requirements.length} requirements, ${ces.length} CEs`);

    if (hazards.length === 0 || requirements.length === 0) {
      await supabase
        .from('ai_workflow_steps')
        .update({ 
          status: 'failed', 
          error_message: 'Need both hazards and requirements to create traceability links' 
        })
        .eq('id', stepId);

      return new Response(JSON.stringify({ 
        error: 'Insufficient data for traceability. Need hazards and requirements.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Build context for AI
    const hazardsList = hazards.map(h => ({
      uid: h.uid,
      title: h.title,
      description: h.description,
      severity: h.severity,
      likelihood: h.likelihood,
      sil: h.sil,
      existing_req_link: h.requirement_id,
      existing_ce_link: h.ce_id,
    }));

    const requirementsList = requirements.map(r => ({
      uid: r.uid,
      title: r.title,
      description: r.description,
      category: r.category,
      priority: r.priority,
      verification_method: r.verification_method,
      sil: r.sil,
    }));

    const cesList = ces.map(c => ({
      uid: c.uid,
      name: c.name,
      description: c.description,
      type: c.type,
      sil_target: c.sil_target,
    }));

    const systemPrompt = `You are a safety traceability expert. Your task is to establish traceability links between hazards, requirements, and certifiable elements.

For each hazard, identify:
1. Which requirement(s) address/mitigate this hazard
2. Which certifiable element(s) implement the mitigation
3. The appropriate verification method for the link

Guidelines:
- A hazard may link to multiple requirements
- Consider SIL levels when matching (safety-critical hazards should link to safety requirements)
- Higher severity hazards need more rigorous verification methods
- Provide a confidence score (0.0-1.0) for each link
- Provide clear rationale for each link

Verification Method Selection:
- Analysis: For design-level hazards, calculations, FMEA/FTA results
- Inspection: For documentation, configuration, labeling
- Demonstration: For operational procedures, human factors
- Test: For safety-critical functions, performance requirements`;

    const userPrompt = `Analyze these items and create traceability links:

HAZARDS:
${JSON.stringify(hazardsList, null, 2)}

REQUIREMENTS:
${JSON.stringify(requirementsList, null, 2)}

CERTIFIABLE ELEMENTS:
${JSON.stringify(cesList, null, 2)}

Create comprehensive traceability links. Skip hazards that already have requirement links unless you find better matches.`;

    const extractionSchema = {
      type: "function",
      function: {
        name: "create_traceability_links",
        description: "Create traceability links between hazards, requirements, and CEs",
        parameters: {
          type: "object",
          properties: {
            links: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hazard_uid: { type: "string", description: "UID of the hazard" },
                  hazard_title: { type: "string", description: "Title of the hazard" },
                  requirement_uid: { type: "string", description: "UID of the linked requirement" },
                  requirement_title: { type: "string", description: "Title of the requirement" },
                  ce_uid: { type: "string", description: "UID of the certifiable element (optional)" },
                  ce_name: { type: "string", description: "Name of the CE (optional)" },
                  link_rationale: { type: "string", description: "Why this link exists" },
                  confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in this link" },
                  verification_method: { 
                    type: "string", 
                    enum: ["analysis", "inspection", "demonstration", "test"],
                    description: "Recommended verification method for this link"
                  },
                },
                required: ["hazard_uid", "hazard_title", "requirement_uid", "requirement_title", "link_rationale", "confidence", "verification_method"],
              },
            },
            unlinked_hazards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hazard_uid: { type: "string" },
                  reason: { type: "string", description: "Why no link could be established" },
                  recommendation: { type: "string", description: "What requirement might be needed" },
                },
              },
              description: "Hazards that could not be linked to any requirement",
            },
            unlinked_requirements: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  requirement_uid: { type: "string" },
                  reason: { type: "string", description: "Why no hazard links to this requirement" },
                },
              },
              description: "Requirements not linked to any hazard (may be non-safety requirements)",
            },
          },
          required: ["links"],
        },
      },
    };

    console.log('Calling AI for traceability analysis...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [extractionSchema],
        tool_choice: { type: 'function', function: { name: 'create_traceability_links' } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', response.status, errorText);
      
      await supabase
        .from('ai_workflow_steps')
        .update({ status: 'failed', error_message: `AI analysis failed: ${response.status}` })
        .eq('id', stepId);

      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No traceability results from AI');
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`Generated ${result.links?.length || 0} traceability links`);

    // Create lookup maps
    const hazardMap = new Map(hazards.map(h => [h.uid, h.id]));
    const requirementMap = new Map(requirements.map(r => [r.uid, r.id]));
    const ceMap = new Map(ces.map(c => [c.uid, c.id]));

    // Store links as artifacts
    const artifacts = (result.links || []).map((link: TraceabilityLink) => ({
      workflow_run_id: workflowId,
      workflow_step_id: stepId,
      artifact_type: 'traceability_link',
      artifact_data: {
        ...link,
        hazard_id: hazardMap.get(link.hazard_uid),
        requirement_id: requirementMap.get(link.requirement_uid),
        ce_id: link.ce_uid ? ceMap.get(link.ce_uid) : null,
      },
      status: 'pending_review',
      verification_method: link.verification_method,
    }));

    // Store unlinked hazards as informational artifacts
    const unlinkedArtifacts = (result.unlinked_hazards || []).map((item: any) => ({
      workflow_run_id: workflowId,
      workflow_step_id: stepId,
      artifact_type: 'traceability_link',
      artifact_data: {
        type: 'unlinked_hazard',
        hazard_uid: item.hazard_uid,
        reason: item.reason,
        recommendation: item.recommendation,
      },
      status: 'pending_review',
    }));

    const allArtifacts = [...artifacts, ...unlinkedArtifacts];

    if (allArtifacts.length > 0) {
      const { error: artifactError } = await supabase
        .from('ai_workflow_artifacts')
        .insert(allArtifacts);

      if (artifactError) {
        console.error('Error saving artifacts:', artifactError);
        throw new Error('Failed to save traceability links');
      }
    }

    // Update step
    await supabase
      .from('ai_workflow_steps')
      .update({
        status: 'awaiting_approval',
        output_summary: {
          links_created: result.links?.length || 0,
          unlinked_hazards: result.unlinked_hazards?.length || 0,
          unlinked_requirements: result.unlinked_requirements?.length || 0,
          high_confidence_links: result.links?.filter((l: any) => l.confidence >= 0.8).length || 0,
        },
      })
      .eq('id', stepId);

    // Update workflow
    await supabase
      .from('ai_workflow_runs')
      .update({ status: 'awaiting_approval' })
      .eq('id', workflowId);

    return new Response(JSON.stringify({
      success: true,
      links_created: result.links?.length || 0,
      unlinked_hazards: result.unlinked_hazards?.length || 0,
      unlinked_requirements: result.unlinked_requirements?.length || 0,
      message: `Created ${result.links?.length || 0} traceability links. Ready for review.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Traceability engine error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});