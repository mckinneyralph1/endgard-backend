import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  workflowId: string;
  stepId: string;
  documentText?: string;
  documentUrl?: string;
  extractionType: 'hazards' | 'requirements' | 'certifiable_elements';
  projectId: string;
  systemContext?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      workflowId, 
      stepId, 
      documentText, 
      documentUrl,
      extractionType, 
      projectId,
      systemContext 
    } = await req.json() as ProcessRequest;

    console.log(`Processing document for workflow ${workflowId}, type: ${extractionType}`);

    if (!documentText && !documentUrl) {
      throw new Error('Either documentText or documentUrl is required');
    }

    // Update step to running
    await supabase
      .from('ai_workflow_steps')
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString() 
      })
      .eq('id', stepId);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Get existing project data for context
    const { data: existingHazards } = await supabase
      .from('hazards')
      .select('uid, title')
      .eq('project_id', projectId)
      .limit(20);

    const { data: existingRequirements } = await supabase
      .from('requirements')
      .select('uid, title')
      .eq('project_id', projectId)
      .limit(20);

    const { data: existingCEs } = await supabase
      .from('certifiable_elements')
      .select('uid, name, type')
      .eq('project_id', projectId)
      .limit(20);

    // Build extraction prompt based on type
    let systemPrompt = '';
    let extractionSchema: any = {};

    if (extractionType === 'hazards') {
      systemPrompt = `You are a safety analysis expert specializing in transportation and industrial systems.

Analyze the provided document and extract ALL potential hazards.

${systemContext ? `System Context: ${systemContext}` : ''}

Existing hazards to avoid duplicates:
${existingHazards?.map(h => `- ${h.uid}: ${h.title}`).join('\n') || 'None'}

For each hazard, identify:
- UID (format: HAZ-XXX, use sequential numbering starting after existing)
- Title (concise, specific hazard name)
- Description (detailed explanation of the hazard)
- Severity: catastrophic (death/system loss), critical (severe injury/major damage), marginal (minor injury), negligible (nuisance)
- Likelihood: frequent, probable, occasional, remote, improbable
- Analysis type: PHA (Preliminary), SHA (System), SSHA (Sub-system), O&SHA (Operations)
- Mitigation (proposed mitigation strategy if mentioned)
- SIL recommendation if safety-critical

Be thorough - extract every identifiable hazard from the document.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_hazards",
          description: "Extract safety hazards from the document",
          parameters: {
            type: "object",
            properties: {
              hazards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    severity: { type: "string", enum: ["catastrophic", "critical", "marginal", "negligible"] },
                    likelihood: { type: "string", enum: ["frequent", "probable", "occasional", "remote", "improbable"] },
                    analysis_type: { type: "string", enum: ["PHA", "SHA", "SSHA", "O&SHA"] },
                    mitigation: { type: "string" },
                    sil: { type: "string", enum: ["SIL 0", "SIL 1", "SIL 2", "SIL 3", "SIL 4"] },
                    source_page: { type: "string" },
                    source_section: { type: "string" },
                  },
                  required: ["uid", "title", "description", "severity", "likelihood"],
                },
              },
            },
            required: ["hazards"],
          },
        },
      };
    } else if (extractionType === 'requirements') {
      systemPrompt = `You are a requirements engineer specializing in safety-critical transportation systems.

Analyze the provided document and extract ALL requirements.

${systemContext ? `System Context: ${systemContext}` : ''}

Existing requirements to avoid duplicates:
${existingRequirements?.map(r => `- ${r.uid}: ${r.title}`).join('\n') || 'None'}

For each requirement, identify:
- UID (format: REQ-XXX, SYS-XXX, SAF-XXX depending on type)
- Title (brief summary)
- Description (full requirement text, use "shall" language)
- Category: functional, safety, performance, interface, compliance
- Priority: critical, high, medium, low
- Verification method: analysis, inspection, demonstration, test
- SIL if safety-critical
- Standard reference if mentioned (e.g., EN 50126, IEEE 1474.1)

Be thorough - extract every identifiable requirement from the document.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_requirements",
          description: "Extract requirements from the document",
          parameters: {
            type: "object",
            properties: {
              requirements: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string", enum: ["functional", "safety", "performance", "interface", "compliance"] },
                    priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                    verification_method: { type: "string", enum: ["analysis", "inspection", "demonstration", "test"] },
                    sil: { type: "string" },
                    standard: { type: "string" },
                    source_page: { type: "string" },
                    source_section: { type: "string" },
                  },
                  required: ["uid", "title", "description", "category", "priority"],
                },
              },
            },
            required: ["requirements"],
          },
        },
      };
    } else if (extractionType === 'certifiable_elements') {
      systemPrompt = `You are a systems engineer specializing in safety certification.

Analyze the provided document and extract certifiable elements (CEs).

${systemContext ? `System Context: ${systemContext}` : ''}

Existing CEs to avoid duplicates:
${existingCEs?.map(c => `- ${c.uid}: ${c.name} (${c.type})`).join('\n') || 'None'}

For each certifiable element, identify:
- UID (format: CE-XXX)
- Name (system/subsystem/component name)
- Type: system, subsystem, component, software, hardware
- Description (what the element does)
- SIL target if safety-critical
- Parent element if this is a child

Extract the hierarchical structure of certifiable elements from the document.`;

      extractionSchema = {
        type: "function",
        function: {
          name: "extract_certifiable_elements",
          description: "Extract certifiable elements from the document",
          parameters: {
            type: "object",
            properties: {
              elements: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    uid: { type: "string" },
                    name: { type: "string" },
                    type: { type: "string", enum: ["system", "subsystem", "component", "software", "hardware"] },
                    description: { type: "string" },
                    sil_target: { type: "string" },
                    parent_uid: { type: "string" },
                    source_page: { type: "string" },
                    source_section: { type: "string" },
                  },
                  required: ["uid", "name", "type"],
                },
              },
            },
            required: ["elements"],
          },
        },
      };
    }

    // Call AI for extraction
    console.log('Calling AI for extraction...');
    
    const textToAnalyze = documentText || `Please analyze the document at: ${documentUrl}`;
    
    // Truncate if needed
    const MAX_CHARS = 500000;
    const processedText = textToAnalyze.length > MAX_CHARS 
      ? textToAnalyze.substring(0, MAX_CHARS / 2) + '\n\n[...truncated...]\n\n' + textToAnalyze.substring(textToAnalyze.length - MAX_CHARS / 2)
      : textToAnalyze;

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
          { role: 'user', content: processedText },
        ],
        tools: [extractionSchema],
        tool_choice: { type: 'function', function: { name: extractionSchema.function.name } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', response.status, errorText);
      
      // Update step to failed
      await supabase
        .from('ai_workflow_steps')
        .update({ 
          status: 'failed', 
          error_message: `AI extraction failed: ${response.status}` 
        })
        .eq('id', stepId);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No extraction results from AI');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('Extraction complete:', extractedData);

    // Store extracted items as workflow artifacts
    const items = extractedData.hazards || extractedData.requirements || extractedData.elements || [];
    
    const artifacts = items.map((item: any) => ({
      workflow_run_id: workflowId,
      workflow_step_id: stepId,
      artifact_type: extractionType === 'certifiable_elements' ? 'certifiable_element' : 
                     extractionType === 'hazards' ? 'hazard' : 'requirement',
      artifact_data: item,
      status: 'pending_review',
      verification_method: item.verification_method || null,
    }));

    if (artifacts.length > 0) {
      const { error: artifactError } = await supabase
        .from('ai_workflow_artifacts')
        .insert(artifacts);

      if (artifactError) {
        console.error('Error saving artifacts:', artifactError);
        throw new Error('Failed to save extracted items');
      }
    }

    // Update step with summary
    await supabase
      .from('ai_workflow_steps')
      .update({
        status: 'awaiting_approval',
        output_summary: {
          extracted_count: items.length,
          extraction_type: extractionType,
          items_preview: items.slice(0, 5).map((i: any) => i.title || i.name),
        },
      })
      .eq('id', stepId);

    // Update workflow status
    await supabase
      .from('ai_workflow_runs')
      .update({ status: 'awaiting_approval' })
      .eq('id', workflowId);

    return new Response(JSON.stringify({
      success: true,
      extracted_count: items.length,
      extraction_type: extractionType,
      message: `Extracted ${items.length} ${extractionType}. Ready for review.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Workflow document processing error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});