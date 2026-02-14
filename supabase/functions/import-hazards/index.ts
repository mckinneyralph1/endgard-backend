import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resilience configuration
const CONFIG = {
  AI_TIMEOUT_MS: 120000, // 2 min for document processing
  MAX_FILE_SIZE_MB: 10,
};

// Performance monitoring
class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  checkpoint(name: string): void {
    this.checkpoints.set(name, Date.now() - this.startTime);
  }

  getSummary(): Record<string, number> {
    return Object.fromEntries(this.checkpoints);
  }
}

// Timeout wrapper for fetch calls
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface HazardRow {
  uid: string;
  title: string;
  description?: string;
  severity: 'catastrophic' | 'critical' | 'marginal' | 'negligible';
  likelihood: 'frequent' | 'probable' | 'occasional' | 'remote' | 'improbable';
  risk_level: 'high' | 'medium' | 'low';
  mitigation?: string;
  status?: 'open' | 'mitigated' | 'accepted' | 'closed';
  analysis_type?: string;
}

Deno.serve(async (req) => {
  const monitor = new PerformanceMonitor();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const contentType = req.headers.get('content-type') || '';
    let projectId: string;
    let overwriteDuplicates: boolean;
    let previewOnly: boolean;
    let hazards: HazardRow[] = [];

    // Handle JSON request (direct hazard import from preview)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      projectId = body.projectId;
      overwriteDuplicates = body.overwriteDuplicates || false;
      hazards = body.hazards || [];

      if (!projectId || hazards.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Missing projectId or hazards' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Handle FormData request (file upload)
      const formData = await req.formData();
      const file = formData.get('file') as File;
      projectId = formData.get('projectId') as string;
      overwriteDuplicates = formData.get('overwriteDuplicates') === 'true';
      previewOnly = formData.get('previewOnly') === 'true';

      if (!file || !projectId) {
        return new Response(
          JSON.stringify({ error: 'Missing file or projectId' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > CONFIG.MAX_FILE_SIZE_MB) {
        return new Response(
          JSON.stringify({ error: `File too large. Maximum size is ${CONFIG.MAX_FILE_SIZE_MB}MB.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Processing file:', file.name, 'for project:', projectId);
      monitor.checkpoint('file_received');

      const fileType = file.name.toLowerCase();

      // Parse based on file type
      if (fileType.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        hazards = Array.isArray(data) ? data : [data];
      } else if (fileType.endsWith('.csv')) {
        const text = await file.text();
        hazards = parseCSV(text);
      } else if (fileType.endsWith('.pdf') || fileType.endsWith('.docx')) {
        // Use AI to extract hazard data from document
        hazards = await extractHazardsFromDocument(file);
        monitor.checkpoint('ai_extraction_complete');
      } else {
        return new Response(
          JSON.stringify({ error: 'Unsupported file format. Use CSV, JSON, PDF, or DOCX.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Parsed hazards:', hazards.length);

      // If preview only, return the hazards without validation/inserting
      if (previewOnly) {
        return new Response(
          JSON.stringify({
            success: true,
            hazards: hazards,
            total: hazards.length,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    monitor.checkpoint('parsing_complete');

    // Fetch project's primary industry to set on hazards
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('primary_industry_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Error fetching project:', projectError);
    }

    const industryId = projectData?.primary_industry_id || null;
    console.log('Project industry_id:', industryId);

    // Validate hazards
    const validatedHazards = hazards.map((h, index) => {
      if (!h.uid || !h.title || !h.severity || !h.likelihood || !h.risk_level) {
        throw new Error(`Row ${index + 1}: Missing required fields (uid, title, severity, likelihood, risk_level)`);
      }
      return {
        project_id: projectId,
        industry_id: industryId,
        uid: h.uid,
        title: h.title,
        description: h.description || null,
        severity: h.severity,
        likelihood: h.likelihood,
        risk_level: h.risk_level,
        mitigation: h.mitigation || null,
        status: h.status || 'open',
        analysis_type: h.analysis_type || 'General',
      };
    });

    console.log('Processing', validatedHazards.length, 'hazards for project:', projectId);
    console.log('Overwrite duplicates:', overwriteDuplicates);

    // Handle duplicates
    if (!overwriteDuplicates) {
      // Check for existing hazards first
      const existingUids = validatedHazards.map(h => h.uid);
      const { data: existing } = await supabase
        .from('hazards')
        .select('uid')
        .eq('project_id', projectId)
        .in('uid', existingUids);

      const existingUidSet = new Set((existing || []).map(h => h.uid));
      const newHazards = validatedHazards.filter(h => !existingUidSet.has(h.uid));

      console.log('Found', existing?.length || 0, 'existing hazards');
      console.log('Will insert', newHazards.length, 'new hazards');

      if (newHazards.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            imported: 0,
            total: validatedHazards.length,
            message: `All ${validatedHazards.length} hazards already exist in this project. Enable "Overwrite Duplicates" to update them.`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Insert only new records
      const { data, error } = await supabase
        .from('hazards')
        .insert(newHazards)
        .select();

      if (error) {
        console.error('Insert error:', error);
        return new Response(
          JSON.stringify({ error: `Database error: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const skipped = validatedHazards.length - newHazards.length;
      monitor.checkpoint('complete');
      console.log(`Import complete. Performance: ${JSON.stringify(monitor.getSummary())}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          imported: data?.length || 0,
          total: validatedHazards.length,
          message: skipped > 0 
            ? `Successfully imported ${data?.length} new hazards. Skipped ${skipped} duplicates.`
            : `Successfully imported ${data?.length} hazards.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Upsert (update existing, insert new)
      const { data, error } = await supabase
        .from('hazards')
        .upsert(validatedHazards, { onConflict: 'project_id,uid' })
        .select();

      if (error) {
        console.error('Upsert error:', error);
        return new Response(
          JSON.stringify({ error: `Database error: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      monitor.checkpoint('complete');
      console.log(`Import complete. Performance: ${JSON.stringify(monitor.getSummary())}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          imported: data?.length || 0,
          total: validatedHazards.length,
          message: `Successfully imported/updated ${data?.length} hazards.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (errorMessage.includes('abort')) {
      return new Response(
        JSON.stringify({ error: 'Request timed out. The document may be too large.' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractHazardsFromDocument(file: File): Promise<HazardRow[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Convert file to base64 using chunk-based approach to avoid stack overflow
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Process in chunks to avoid stack overflow
  let binaryString = '';
  const chunkSize = 8192; // 8KB chunks
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binaryString);
  
  // Use the correct OpenAI endpoint with timeout
  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              document: {
                data: base64,
                media_type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
              },
            },
            {
              type: 'text',
              text: `Extract ALL hazards from this document and return them as a JSON array. Extract up to 500 hazards if present - do not limit or truncate the extraction. Be thorough and comprehensive.

Each hazard should have:
- uid: unique identifier (create one if not present, format: H001, H002, H003, etc. continuing sequentially)
- title: hazard name/title
- description: detailed description (optional)
- severity: one of [catastrophic, critical, marginal, negligible]
- likelihood: one of [frequent, probable, occasional, remote, improbable]
- risk_level: one of [high, medium, low]
- mitigation: mitigation strategy (optional)
- status: one of [open, mitigated, accepted, closed] (default: open)
- analysis_type: the type of hazard analysis methodology if mentioned (e.g., SHA, SSHA, FMECA, O&SHA, Security) (optional, default: General)

IMPORTANT: Extract EVERY hazard mentioned in the document. Do not summarize or skip any hazards. If the document contains 100+ hazards, extract all of them.

Return ONLY the JSON array, no additional text.`,
            },
          ],
        }],
      }),
    },
    CONFIG.AI_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI API error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add credits.');
    }
    
    throw new Error(`AI analysis failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const content = result.choices[0]?.message?.content || '[]';
  
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const hazards = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  
  return hazards;
}

function parseCSV(text: string): HazardRow[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const hazards: HazardRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV values properly
    const values = parseCSVLine(lines[i]);
    const hazard: any = {};

    headers.forEach((header, index) => {
      const value = (values[index] || '').trim();
      
      // Map column variations to standard hazard fields
      switch (header) {
        // UID mappings
        case 'uid':
        case 'id':
        case 'hazard_id':
          hazard.uid = value;
          break;
          
        // Title mappings
        case 'title':
        case 'name':
        case 'hazard_name':
        case 'hazard_title':
          hazard.title = value;
          break;
          
        // Description mappings
        case 'description':
        case 'desc':
        case 'hazard_description':
          hazard.description = value;
          break;
          
        // Severity mappings
        case 'severity':
          hazard.severity = value.toLowerCase();
          break;
          
        // Likelihood mappings
        case 'likelihood':
        case 'probability':
          hazard.likelihood = value.toLowerCase();
          break;
          
        // Risk level mappings
        case 'risk_level':
        case 'risk':
        case 'risklevel':
        case 'risk_rating':
          hazard.risk_level = value.toLowerCase();
          break;
          
        // Mitigation - combine SMS fields into mitigation
        case 'mitigation':
        case 'control':
          hazard.mitigation = value;
          break;
          
        // SMS mitigation fields - append to mitigation
        case 'sms_policy_mitigation':
          if (value) hazard.sms_policy_mitigation = value;
          break;
        case 'sms_srm_mitigation':
          if (value) hazard.sms_srm_mitigation = value;
          break;
        case 'sms_safety_assurance':
          if (value) hazard.sms_safety_assurance = value;
          break;
        case 'sms_safety_promotion':
          if (value) hazard.sms_safety_promotion = value;
          break;
          
        // Status mappings
        case 'status':
          hazard.status = value.toLowerCase();
          break;
          
        // Analysis type mappings
        case 'analysis_type':
        case 'analysis':
        case 'type':
        case 'methodology':
          hazard.analysis_type = value;
          break;
          
        // Additional fields stored in description or as metadata
        case 'certifiable_element':
        case 'certifiable_element_code':
        case 'system_element':
          if (value) hazard[header] = value;
          break;
          
        case 'cause':
          if (value) hazard.cause = value;
          break;
          
        case 'potential_consequence':
          if (value) hazard.potential_consequence = value;
          break;
          
        case 'verification_method':
          if (value) hazard.verification_method = value;
          break;
          
        case 'objective_evidence':
          if (value) hazard.objective_evidence = value;
          break;
          
        case 'responsible_role':
          if (value) hazard.responsible_role = value;
          break;
      }
    });

    // Build comprehensive description from additional fields
    const additionalInfo: string[] = [];
    if (hazard.cause) additionalInfo.push(`Cause: ${hazard.cause}`);
    if (hazard.potential_consequence) additionalInfo.push(`Potential Consequence: ${hazard.potential_consequence}`);
    if (hazard.certifiable_element) additionalInfo.push(`Certifiable Element: ${hazard.certifiable_element}`);
    if (hazard.certifiable_element_code) additionalInfo.push(`CE Code: ${hazard.certifiable_element_code}`);
    if (hazard.system_element) additionalInfo.push(`System Element: ${hazard.system_element}`);
    if (hazard.verification_method) additionalInfo.push(`Verification Method: ${hazard.verification_method}`);
    if (hazard.objective_evidence) additionalInfo.push(`Objective Evidence: ${hazard.objective_evidence}`);
    if (hazard.responsible_role) additionalInfo.push(`Responsible Role: ${hazard.responsible_role}`);
    
    if (additionalInfo.length > 0) {
      hazard.description = hazard.description 
        ? `${hazard.description}\n\n${additionalInfo.join('\n')}`
        : additionalInfo.join('\n');
    }

    // Build comprehensive mitigation from SMS fields
    const smsMitigations: string[] = [];
    if (hazard.sms_policy_mitigation) smsMitigations.push(`Policy: ${hazard.sms_policy_mitigation}`);
    if (hazard.sms_srm_mitigation) smsMitigations.push(`SRM: ${hazard.sms_srm_mitigation}`);
    if (hazard.sms_safety_assurance) smsMitigations.push(`Safety Assurance: ${hazard.sms_safety_assurance}`);
    if (hazard.sms_safety_promotion) smsMitigations.push(`Safety Promotion: ${hazard.sms_safety_promotion}`);
    
    if (smsMitigations.length > 0) {
      hazard.mitigation = hazard.mitigation 
        ? `${hazard.mitigation}\n\nSMS Mitigations:\n${smsMitigations.join('\n')}`
        : `SMS Mitigations:\n${smsMitigations.join('\n')}`;
    }

    if (hazard.uid && hazard.title) {
      hazards.push(hazard);
    }
  }

  return hazards;
}

// Parse a CSV line handling quoted values with commas
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  
  return values;
}
