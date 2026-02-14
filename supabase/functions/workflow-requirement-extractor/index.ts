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

    console.log('Starting requirement extraction for workflow:', workflow_run_id);

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

    // Get existing requirements for context
    const { data: existingRequirements } = await supabase
      .from('requirements')
      .select('uid, title')
      .eq('project_id', project_id);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Use AI to extract requirements from the document content
    const systemPrompt = `You are an expert requirements engineer specializing in ${project?.standard || 'safety-critical'} systems.
Your task is to extract requirements from technical documents.

For each requirement identified, provide:
1. uid: Unique identifier (format: REQ-XXX)
2. title: Clear, concise requirement title
3. description: Full requirement text with acceptance criteria
4. category: Functional, Safety, Performance, Interface, Environmental, Regulatory
5. priority: Critical, High, Medium, Low
6. standard: Applicable standard (e.g., ${project?.standard || 'IEC 61508'})
7. verification_method: Analysis, Inspection, Test, Demonstration
8. sil: Safety Integrity Level if applicable (SIL-1 to SIL-4)
9. requirement_type: System, Software, Hardware, Interface, Safety
10. hierarchy_level: 1 for top-level, 2 for derived, 3 for detailed

Existing requirement UIDs to avoid duplicates: ${existingRequirements?.map(r => r.uid).join(', ') || 'None'}

Return a JSON array of requirements.`;

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
          { role: 'user', content: `Extract all requirements from this document content:\n\n${JSON.stringify(extracted_content)}` }
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
    
    let requirements = [];
    try {
      const parsed = JSON.parse(content);
      requirements = parsed.requirements || parsed || [];
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      requirements = [];
    }

    console.log(`Extracted ${requirements.length} requirements`);

    // Store requirements as artifacts for review
    const artifactInserts = requirements.map((req: any, index: number) => ({
      workflow_run_id,
      workflow_step_id: step_id,
      artifact_type: 'requirement',
      artifact_data: {
        ...req,
        uid: req.uid || `REQ-${String(index + 1).padStart(3, '0')}`,
        project_id,
        status: 'Draft'
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
          requirements_extracted: requirements.length,
          by_category: requirements.reduce((acc: any, r: any) => {
            acc[r.category || 'Other'] = (acc[r.category || 'Other'] || 0) + 1;
            return acc;
          }, {}),
          by_priority: {
            critical: requirements.filter((r: any) => r.priority === 'Critical').length,
            high: requirements.filter((r: any) => r.priority === 'High').length,
            medium: requirements.filter((r: any) => r.priority === 'Medium').length,
            low: requirements.filter((r: any) => r.priority === 'Low').length
          },
          by_type: requirements.reduce((acc: any, r: any) => {
            acc[r.requirement_type || 'System'] = (acc[r.requirement_type || 'System'] || 0) + 1;
            return acc;
          }, {})
        }
      })
      .eq('id', step_id);

    return new Response(JSON.stringify({
      success: true,
      requirements_count: requirements.length,
      message: `Extracted ${requirements.length} requirements awaiting review`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in requirement extraction:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
