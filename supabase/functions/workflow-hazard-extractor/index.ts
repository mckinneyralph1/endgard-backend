import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workflow_run_id, step_id, project_id, extracted_content } = await req.json();

    console.log('Starting hazard extraction for workflow:', workflow_run_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update step status
    await supabase
      .from('ai_workflow_steps')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', step_id);

    // Get project context
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single();

    // Get existing hazards for context
    const { data: existingHazards } = await supabase
      .from('hazards')
      .select('uid, title')
      .eq('project_id', project_id);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Use AI to extract hazards from the document content
    const systemPrompt = `You are an expert safety engineer specializing in hazard analysis for ${project?.standard || 'safety-critical'} systems.
Your task is to extract hazards from technical documents.

For each hazard identified, provide:
1. uid: Unique identifier (format: HAZ-XXX)
2. title: Clear, concise hazard title
3. description: Detailed description of the hazard
4. severity: Catastrophic, Critical, Major, Minor, Negligible
5. likelihood: Frequent, Probable, Occasional, Remote, Improbable
6. risk_level: Critical, High, Medium, Low (based on severity × likelihood)
7. mitigation: Suggested mitigation strategy
8. analysis_type: PHA, FMEA, FTA, HAZOP, or Other
9. sil: Safety Integrity Level if applicable (SIL-1 to SIL-4)

Existing hazard UIDs to avoid duplicates: ${existingHazards?.map(h => h.uid).join(', ') || 'None'}

Return a JSON array of hazards.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract all hazards from this document content:\n\n${JSON.stringify(extracted_content)}` }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices[0]?.message?.content;
    
    let hazards = [];
    try {
      const parsed = JSON.parse(content);
      hazards = parsed.hazards || parsed || [];
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      hazards = [];
    }

    console.log(`Extracted ${hazards.length} hazards`);

    // Store hazards as artifacts for review
    const artifactInserts = hazards.map((hazard: any, index: number) => ({
      workflow_run_id,
      workflow_step_id: step_id,
      artifact_type: 'hazard',
      artifact_data: {
        ...hazard,
        uid: hazard.uid || `HAZ-${String(index + 1).padStart(3, '0')}`,
        project_id,
        status: 'Open'
      },
      status: 'pending_review'
    }));

    if (artifactInserts.length > 0) {
      await supabase
        .from('ai_workflow_artifacts')
        .insert(artifactInserts);
    }

    // Update step with summary
    await supabase
      .from('ai_workflow_steps')
      .update({
        status: 'awaiting_approval',
        completed_at: new Date().toISOString(),
        output_summary: {
          hazards_extracted: hazards.length,
          by_risk_level: {
            critical: hazards.filter((h: any) => h.risk_level === 'Critical').length,
            high: hazards.filter((h: any) => h.risk_level === 'High').length,
            medium: hazards.filter((h: any) => h.risk_level === 'Medium').length,
            low: hazards.filter((h: any) => h.risk_level === 'Low').length
          },
          by_analysis_type: hazards.reduce((acc: any, h: any) => {
            acc[h.analysis_type || 'Other'] = (acc[h.analysis_type || 'Other'] || 0) + 1;
            return acc;
          }, {})
        }
      })
      .eq('id', step_id);

    return new Response(JSON.stringify({
      success: true,
      hazards_count: hazards.length,
      message: `Extracted ${hazards.length} hazards awaiting review`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in hazard extraction:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
