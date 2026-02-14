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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, format, projectId, content } = await req.json();

    console.log(`Processing ${action} request for project ${projectId} in ${format} format`);

    if (action === 'export') {
      // Fetch requirements
      const { data: requirements, error } = await supabase
        .from('requirements')
        .select('*')
        .eq('project_id', projectId)
        .order('hierarchy_level', { ascending: true })
        .order('uid', { ascending: true });

      if (error) throw error;

      let exportContent: string;

      if (format === 'csv') {
        const headers = ['uid', 'title', 'description', 'standard', 'category', 'priority', 'status', 'verification_method', 'sil', 'requirement_type', 'parent_uid', 'hierarchy_level'];
        const rows = requirements.map(req => {
          const parentReq = requirements.find(r => r.id === req.parent_id);
          return headers.map(h => {
            if (h === 'parent_uid') return parentReq?.uid || '';
            const val = req[h] || '';
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
          }).join(',');
        });
        exportContent = [headers.join(','), ...rows].join('\n');
      } 
      else if (format === 'json') {
        const enrichedReqs = requirements.map(req => {
          const parentReq = requirements.find(r => r.id === req.parent_id);
          return { ...req, parent_uid: parentReq?.uid || null };
        });
        exportContent = JSON.stringify(enrichedReqs, null, 2);
      }
      else if (format === 'reqif') {
        // Generate ReqIF XML
        exportContent = generateReqIF(requirements);
      }
      else {
        throw new Error(`Unsupported export format: ${format}`);
      }

      return new Response(JSON.stringify({ content: exportContent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'import') {
      let parsedRequirements: any[] = [];

      if (format === 'csv') {
        parsedRequirements = parseCSV(content);
      } 
      else if (format === 'json') {
        parsedRequirements = JSON.parse(content);
      }
      else if (format === 'reqif') {
        parsedRequirements = parseReqIF(content);
      }
      else {
        throw new Error(`Unsupported import format: ${format}`);
      }

      console.log(`Parsed ${parsedRequirements.length} requirements from ${format}`);

      // Build UID to ID map for parent linking
      const uidToId: Record<string, string> = {};
      const insertedIds: string[] = [];

      // First pass: insert requirements without parent links
      for (const req of parsedRequirements) {
        const insertData = {
          project_id: projectId,
          uid: req.uid || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          title: req.title || 'Untitled Requirement',
          description: req.description || null,
          standard: req.standard || 'Custom',
          category: req.category || 'General',
          priority: req.priority || 'Medium',
          status: req.status || 'open',
          verification_method: req.verification_method || null,
          sil: req.sil || null,
          requirement_type: req.requirement_type || 'system',
          hierarchy_level: parseInt(req.hierarchy_level) || 0
        };

        const { data, error } = await supabase
          .from('requirements')
          .insert(insertData)
          .select('id, uid')
          .single();

        if (error) {
          console.error('Error inserting requirement:', error);
          continue;
        }

        uidToId[data.uid] = data.id;
        insertedIds.push(data.id);

        // Store parent_uid for second pass
        if (req.parent_uid) {
          uidToId[`parent_${data.uid}`] = req.parent_uid;
        }
      }

      // Second pass: update parent links
      for (const uid of Object.keys(uidToId)) {
        if (uid.startsWith('parent_')) {
          const childUid = uid.replace('parent_', '');
          const parentUid = uidToId[uid];
          const childId = uidToId[childUid];
          const parentId = uidToId[parentUid];

          if (childId && parentId) {
            await supabase
              .from('requirements')
              .update({ parent_id: parentId })
              .eq('id', childId);
          }
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        count: insertedIds.length 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    console.error("Error in import-export-requirements:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseCSV(content: string): any[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requirements: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const req: any = {};
    headers.forEach((header, idx) => {
      req[header] = values[idx]?.trim() || '';
    });
    if (req.title || req.uid) {
      requirements.push(req);
    }
  }

  return requirements;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

function generateReqIF(requirements: any[]): string {
  const timestamp = new Date().toISOString();
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="header-001">
      <CREATION-TIME>${timestamp}</CREATION-TIME>
      <TITLE>Requirements Export</TITLE>
      <SOURCE-TOOL-ID>EndGard</SOURCE-TOOL-ID>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <SPEC-OBJECTS>`;

  for (const req of requirements) {
    xml += `
        <SPEC-OBJECT IDENTIFIER="${req.id}">
          <VALUES>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.uid)}"/>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.title)}"/>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.description || '')}"/>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.status)}"/>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.priority)}"/>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.category)}"/>
          </VALUES>
        </SPEC-OBJECT>`;
  }

  xml += `
      </SPEC-OBJECTS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;

  return xml;
}

function parseReqIF(content: string): any[] {
  const requirements: any[] = [];
  
  // Basic ReqIF parsing - extract SPEC-OBJECTs
  const specObjectRegex = /<SPEC-OBJECT[^>]*IDENTIFIER="([^"]*)"[^>]*>([\s\S]*?)<\/SPEC-OBJECT>/g;
  const valueRegex = /<ATTRIBUTE-VALUE-STRING[^>]*THE-VALUE="([^"]*)"/g;

  let match;
  while ((match = specObjectRegex.exec(content)) !== null) {
    const values: string[] = [];
    let valueMatch;
    const objectContent = match[2];
    
    while ((valueMatch = valueRegex.exec(objectContent)) !== null) {
      values.push(valueMatch[1]);
    }

    if (values.length >= 2) {
      requirements.push({
        uid: values[0] || `REQ-${Date.now()}`,
        title: values[1] || 'Imported Requirement',
        description: values[2] || '',
        status: values[3] || 'open',
        priority: values[4] || 'Medium',
        category: values[5] || 'General'
      });
    }
  }

  return requirements;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
