import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EntityType = 'requirements' | 'hazards' | 'test_cases';

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, format, projectId, entityType, content, syncMode } = await req.json();

    console.log(`Processing ${action} for ${entityType} in project ${projectId} (format: ${format})`);

    if (action === 'export') {
      const exportContent = await handleExport(supabase, projectId, entityType, format);
      return new Response(JSON.stringify({ content: exportContent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'import') {
      const result = await handleImport(supabase, projectId, entityType, format, content, syncMode || 'create');
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    console.error("Error in import-export-data:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleExport(supabase: any, projectId: string, entityType: EntityType, format: string): Promise<string> {
  let data: any[];
  let parentField: string | null = null;

  if (entityType === 'requirements') {
    const { data: requirements, error } = await supabase
      .from('requirements')
      .select('*')
      .eq('project_id', projectId)
      .order('hierarchy_level', { ascending: true })
      .order('uid', { ascending: true });
    if (error) throw error;
    data = requirements;
    parentField = 'parent_id';
  } else if (entityType === 'hazards') {
    const { data: hazards, error } = await supabase
      .from('hazards')
      .select('*')
      .eq('project_id', projectId)
      .order('uid', { ascending: true });
    if (error) throw error;
    data = hazards;
  } else if (entityType === 'test_cases') {
    const { data: testCases, error } = await supabase
      .from('test_cases')
      .select('*')
      .eq('project_id', projectId)
      .order('uid', { ascending: true });
    if (error) throw error;
    data = testCases;
  } else {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  // Add parent_uid for requirements
  if (parentField && data) {
    const idToUid: Record<string, string> = {};
    data.forEach(item => { idToUid[item.id] = item.uid; });
    data = data.map(item => ({
      ...item,
      parent_uid: item[parentField] ? idToUid[item[parentField]] || null : null
    }));
  }

  if (format === 'csv') {
    return generateCSV(data, entityType);
  } else if (format === 'json') {
    return JSON.stringify(data, null, 2);
  } else if (format === 'reqif') {
    return generateReqIF(data, entityType);
  }

  throw new Error(`Unsupported format: ${format}`);
}

async function handleImport(
  supabase: any,
  projectId: string,
  entityType: EntityType,
  format: string,
  content: unknown,
  syncMode: 'create' | 'sync' | 'update'
): Promise<SyncResult> {
  let parsedData: any[];
  let derivedFrom: 'array' | 'criteria' | 'requirements' | 'hazards' | 'test_cases' | 'items' | 'data' = 'array';

  if (format === 'csv') {
    if (typeof content !== 'string') throw new Error('CSV content must be a string');
    parsedData = parseCSV(content, entityType);
  } else if (format === 'json') {
    const parsed = parseJsonPayload(content);

    // Handle different JSON structures
    if (Array.isArray(parsed)) {
      parsedData = parsed;
      derivedFrom = 'array';
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).criteria)) {
      // EndGard criteria baseline format
      parsedData = (parsed as any).criteria;
      derivedFrom = 'criteria';
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).requirements)) {
      parsedData = (parsed as any).requirements;
      derivedFrom = 'requirements';
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).hazards)) {
      parsedData = (parsed as any).hazards;
      derivedFrom = 'hazards';
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).test_cases)) {
      parsedData = (parsed as any).test_cases;
      derivedFrom = 'test_cases';
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).items)) {
      parsedData = (parsed as any).items;
      derivedFrom = 'items';
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).data)) {
      parsedData = (parsed as any).data;
      derivedFrom = 'data';
    } else {
      throw new Error('JSON must be an array or contain a criteria/requirements/hazards/test_cases/items/data array');
    }

    // If importing requirements from EndGard criteria, normalize fields so importRequirements works predictably.
    if (entityType === 'requirements' && derivedFrom === 'criteria') {
      parsedData = parsedData.map((c: any) => ({
        uid: c.criteria_id ?? c.uid,
        title: c.title ?? c.requirement_text ?? 'Untitled Requirement',
        description: c.requirement_text ?? c.description ?? null,
        standard: c.standard ?? c.mode ?? 'RAIL',
        category: c.discipline ?? c.category ?? 'General',
        priority: c.priority ?? 'Medium',
        status: c.default_status ?? c.status ?? 'Draft',
        verification_method: Array.isArray(c.verification_methods)
          ? c.verification_methods.join(', ')
          : c.verification_methods ?? c.verification_method ?? null,
        external_id: c.criteria_id ?? c.external_id,
        external_tool: c.external_tool ?? 'endgard_seed',
        // Keep any hierarchy/linking fields if present
        parent_uid: c.parent_uid ?? null,
        hierarchy_level: c.hierarchy_level ?? 0,
        requirement_type: c.requirement_type ?? 'criteria',
        sil: c.sil ?? null,
      }));
    }
  } else if (format === 'reqif') {
    if (typeof content !== 'string') throw new Error('ReqIF content must be a string');
    parsedData = parseReqIF(content, entityType);
  } else {
    throw new Error(`Unsupported format: ${format}`);
  }

  console.log(`Parsed ${parsedData.length} ${entityType} items (syncMode: ${syncMode})`);

  const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (entityType === 'requirements') {
    await importRequirements(supabase, projectId, parsedData, syncMode, result);
  } else if (entityType === 'hazards') {
    await importHazards(supabase, projectId, parsedData, syncMode, result);
  } else if (entityType === 'test_cases') {
    await importTestCases(supabase, projectId, parsedData, syncMode, result);
  }

  return result;
}

function parseJsonPayload(content: unknown): unknown {
  // content sometimes arrives already-parsed (object/array). If it's a string, parse it.
  let parsed: unknown = content;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid JSON content: ${msg}`);
    }
  }

  // Handle double-encoded JSON (string inside JSON)
  if (typeof parsed === 'string') {
    const t = parsed.trim();
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']'))
    ) {
      try {
        parsed = JSON.parse(t);
      } catch {
        // ignore - will fail downstream with a clear message
      }
    }
  }

  return parsed;
}

async function importRequirements(supabase: any, projectId: string, items: any[], syncMode: string, result: SyncResult) {
  const uidToId: Record<string, string> = {};

  for (const item of items) {
    const checksum = computeChecksum(item);
    const externalId = item.external_id || item.id;

    // Check for existing item by external_id or uid
    const { data: existing } = await supabase
      .from('requirements')
      .select('id, external_checksum')
      .eq('project_id', projectId)
      .or(`external_id.eq.${externalId},uid.eq.${item.uid}`)
      .maybeSingle();

    if (existing && syncMode === 'create') {
      result.skipped++;
      uidToId[item.uid] = existing.id;
      continue;
    }

    if (existing && syncMode === 'sync' && existing.external_checksum === checksum) {
      result.skipped++;
      uidToId[item.uid] = existing.id;
      continue;
    }

    const insertData = {
      project_id: projectId,
      uid: item.uid || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: item.title || 'Untitled Requirement',
      description: item.description || null,
      standard: item.standard || 'Custom',
      category: item.category || 'General',
      priority: item.priority || 'Medium',
      status: item.status || 'open',
      verification_method: item.verification_method || null,
      sil: item.sil || null,
      requirement_type: item.requirement_type || 'system',
      hierarchy_level: parseInt(item.hierarchy_level) || 0,
      external_id: externalId,
      external_tool: item.external_tool || 'manual',
      external_last_sync: new Date().toISOString(),
      external_checksum: checksum
    };

    try {
      if (existing) {
        const { error } = await supabase
          .from('requirements')
          .update(insertData)
          .eq('id', existing.id);
        if (error) throw error;
        result.updated++;
        uidToId[item.uid] = existing.id;
      } else {
        const { data, error } = await supabase
          .from('requirements')
          .insert(insertData)
          .select('id')
          .single();
        if (error) throw error;
        result.created++;
        uidToId[item.uid] = data.id;
      }

      if (item.parent_uid) {
        uidToId[`parent_${item.uid}`] = item.parent_uid;
      }
    } catch (e: any) {
      result.errors.push(`Error processing ${item.uid}: ${e.message}`);
    }
  }

  // Update parent links
  for (const key of Object.keys(uidToId)) {
    if (key.startsWith('parent_')) {
      const childUid = key.replace('parent_', '');
      const parentUid = uidToId[key];
      const childId = uidToId[childUid];
      const parentId = uidToId[parentUid];

      if (childId && parentId) {
        await supabase.from('requirements').update({ parent_id: parentId }).eq('id', childId);
      }
    }
  }
}

async function importHazards(supabase: any, projectId: string, items: any[], syncMode: string, result: SyncResult) {
  for (const item of items) {
    const checksum = computeChecksum(item);
    const externalId = item.external_id || item.id;

    const { data: existing } = await supabase
      .from('hazards')
      .select('id, external_checksum')
      .eq('project_id', projectId)
      .or(`external_id.eq.${externalId},uid.eq.${item.uid}`)
      .maybeSingle();

    if (existing && syncMode === 'create') {
      result.skipped++;
      continue;
    }

    if (existing && syncMode === 'sync' && existing.external_checksum === checksum) {
      result.skipped++;
      continue;
    }

    const insertData = {
      project_id: projectId,
      uid: item.uid || `HAZ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: item.title || 'Untitled Hazard',
      description: item.description || null,
      severity: item.severity || 'Minor',
      likelihood: item.likelihood || 'Improbable',
      risk_level: item.risk_level || 'Low',
      mitigation: item.mitigation || null,
      status: item.status || 'open',
      analysis_type: item.analysis_type || 'General',
      sil: item.sil || null,
      external_id: externalId,
      external_tool: item.external_tool || 'manual',
      external_last_sync: new Date().toISOString(),
      external_checksum: checksum
    };

    try {
      if (existing) {
        const { error } = await supabase.from('hazards').update(insertData).eq('id', existing.id);
        if (error) throw error;
        result.updated++;
      } else {
        const { error } = await supabase.from('hazards').insert(insertData);
        if (error) throw error;
        result.created++;
      }
    } catch (e: any) {
      result.errors.push(`Error processing ${item.uid}: ${e.message}`);
    }
  }
}

async function importTestCases(supabase: any, projectId: string, items: any[], syncMode: string, result: SyncResult) {
  for (const item of items) {
    const checksum = computeChecksum(item);
    const externalId = item.external_id || item.id;

    const { data: existing } = await supabase
      .from('test_cases')
      .select('id, external_checksum')
      .eq('project_id', projectId)
      .or(`external_id.eq.${externalId},uid.eq.${item.uid}`)
      .maybeSingle();

    if (existing && syncMode === 'create') {
      result.skipped++;
      continue;
    }

    if (existing && syncMode === 'sync' && existing.external_checksum === checksum) {
      result.skipped++;
      continue;
    }

    const insertData = {
      project_id: projectId,
      uid: item.uid || `TC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: item.title || 'Untitled Test Case',
      description: item.description || null,
      expected_result: item.expected_result || null,
      actual_result: item.actual_result || null,
      status: item.status || 'Not Executed',
      priority: item.priority || 'Medium',
      test_type: item.test_type || 'Functional',
      external_id: externalId,
      external_tool: item.external_tool || 'manual',
      external_last_sync: new Date().toISOString(),
      external_checksum: checksum
    };

    try {
      if (existing) {
        const { error } = await supabase.from('test_cases').update(insertData).eq('id', existing.id);
        if (error) throw error;
        result.updated++;
      } else {
        const { error } = await supabase.from('test_cases').insert(insertData);
        if (error) throw error;
        result.created++;
      }
    } catch (e: any) {
      result.errors.push(`Error processing ${item.uid}: ${e.message}`);
    }
  }
}

function computeChecksum(item: any): string {
  const str = JSON.stringify({
    uid: item.uid,
    title: item.title,
    description: item.description,
    status: item.status
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function generateCSV(data: any[], entityType: EntityType): string {
  let headers: string[];

  if (entityType === 'requirements') {
    headers = ['uid', 'title', 'description', 'standard', 'category', 'priority', 'status', 'verification_method', 'sil', 'requirement_type', 'parent_uid', 'hierarchy_level', 'external_id', 'external_tool'];
  } else if (entityType === 'hazards') {
    headers = ['uid', 'title', 'description', 'severity', 'likelihood', 'risk_level', 'mitigation', 'status', 'analysis_type', 'sil', 'external_id', 'external_tool'];
  } else {
    headers = ['uid', 'title', 'description', 'expected_result', 'actual_result', 'status', 'priority', 'test_type', 'external_id', 'external_tool'];
  }

  const rows = data.map(item => {
    return headers.map(h => {
      const val = item[h] || '';
      return typeof val === 'string' && (val.includes(',') || val.includes('\n')) ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function generateReqIF(data: any[], entityType: EntityType): string {
  const timestamp = new Date().toISOString();
  const typeName = entityType.replace('_', ' ').toUpperCase();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="header-001">
      <CREATION-TIME>${timestamp}</CREATION-TIME>
      <TITLE>${typeName} Export</TITLE>
      <SOURCE-TOOL-ID>EndGard</SOURCE-TOOL-ID>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <SPEC-OBJECTS>`;

  for (const item of data) {
    xml += `
        <SPEC-OBJECT IDENTIFIER="${item.id}" LONG-NAME="${escapeXml(item.title)}">
          <VALUES>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="UID" THE-VALUE="${escapeXml(item.uid)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Title" THE-VALUE="${escapeXml(item.title)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Description" THE-VALUE="${escapeXml(item.description || '')}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Status" THE-VALUE="${escapeXml(item.status)}"/>`;

    if (entityType === 'requirements') {
      xml += `
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Priority" THE-VALUE="${escapeXml(item.priority)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Category" THE-VALUE="${escapeXml(item.category)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Standard" THE-VALUE="${escapeXml(item.standard)}"/>`;
    } else if (entityType === 'hazards') {
      xml += `
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Severity" THE-VALUE="${escapeXml(item.severity)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="Likelihood" THE-VALUE="${escapeXml(item.likelihood)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="RiskLevel" THE-VALUE="${escapeXml(item.risk_level)}"/>`;
    } else if (entityType === 'test_cases') {
      xml += `
            <ATTRIBUTE-VALUE-STRING LONG-NAME="ExpectedResult" THE-VALUE="${escapeXml(item.expected_result || '')}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="TestType" THE-VALUE="${escapeXml(item.test_type)}"/>`;
    }

    if (item.external_id) {
      xml += `
            <ATTRIBUTE-VALUE-STRING LONG-NAME="ExternalID" THE-VALUE="${escapeXml(item.external_id)}"/>
            <ATTRIBUTE-VALUE-STRING LONG-NAME="ExternalTool" THE-VALUE="${escapeXml(item.external_tool || '')}"/>`;
    }

    xml += `
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

function parseCSV(content: string, entityType: EntityType): any[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const items: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const item: any = {};
    headers.forEach((header, idx) => {
      item[header] = values[idx]?.trim() || '';
    });
    if (item.title || item.uid) {
      items.push(item);
    }
  }

  return items;
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

function parseReqIF(content: string, entityType: EntityType): any[] {
  const items: any[] = [];
  const specObjectRegex = /<SPEC-OBJECT[^>]*IDENTIFIER="([^"]*)"[^>]*>([\s\S]*?)<\/SPEC-OBJECT>/g;
  const attrRegex = /<ATTRIBUTE-VALUE-STRING[^>]*LONG-NAME="([^"]*)"[^>]*THE-VALUE="([^"]*)"/g;

  let match;
  while ((match = specObjectRegex.exec(content)) !== null) {
    const item: any = { external_id: match[1] };
    let attrMatch;
    const objectContent = match[2];

    while ((attrMatch = attrRegex.exec(objectContent)) !== null) {
      const key = attrMatch[1].toLowerCase().replace(/\s+/g, '_');
      item[key] = attrMatch[2];
    }

    if (item.title || item.uid) {
      items.push(item);
    }
  }

  return items;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
