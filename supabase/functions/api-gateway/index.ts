import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Validate API key and return key record
async function validateApiKey(
  supabaseAdmin: ReturnType<typeof createClient>,
  apiKey: string
) {
  // Hash the key for lookup
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: keyRecord, error } = await supabaseAdmin
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !keyRecord) return null;

  // Check expiration
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return null;
  }

  // Update last used
  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id);

  return keyRecord;
}

// Check rate limit
async function checkRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  keyId: string,
  limit: number
): Promise<{ allowed: boolean; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { count } = await supabaseAdmin
    .from("api_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("api_key_id", keyId)
    .gte("created_at", oneHourAgo);

  const used = count || 0;
  return { allowed: used < limit, remaining: Math.max(0, limit - used) };
}

// Log API usage
async function logUsage(
  supabaseAdmin: ReturnType<typeof createClient>,
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  req: Request
) {
  await supabaseAdmin.from("api_usage_logs").insert({
    api_key_id: keyId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    ip_address: req.headers.get("x-forwarded-for") || "unknown",
    user_agent: req.headers.get("user-agent"),
  });
}

// Route handlers
async function handleProjects(
  supabaseAdmin: ReturnType<typeof createClient>,
  method: string,
  pathParts: string[],
  params: URLSearchParams,
  _body: unknown,
  scopes: string[]
) {
  if (!scopes.includes("read:projects") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: read:projects" } } };
  }

  if (pathParts.length === 0) {
    // GET /projects
    let query = supabaseAdmin
      .from("projects")
      .select("*", { count: "exact" });

    const status = params.get("status");
    if (status) query = query.eq("status", status);
    
    const industry = params.get("industry");
    if (industry) query = query.eq("industry", industry);

    const limit = Math.min(parseInt(params.get("limit") || "50"), 100);
    const offset = parseInt(params.get("offset") || "0");
    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

    const { data, error, count } = await query;
    if (error) return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: error.message } } };

    return {
      status: 200,
      body: { data, meta: { total: count, limit, offset } },
    };
  }

  if (pathParts.length === 1) {
    // GET /projects/:id
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", pathParts[0])
      .single();

    if (error) return { status: 404, body: { error: { code: "NOT_FOUND", message: "Project not found" } } };
    return { status: 200, body: { data } };
  }

  if (pathParts.length === 2 && pathParts[1] === "stats") {
    // GET /projects/:id/stats
    const { data, error } = await supabaseAdmin.rpc("get_project_stats", {
      p_project_id: pathParts[0],
    });
    if (error) return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: error.message } } };
    return { status: 200, body: { data } };
  }

  return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint not found" } } };
}

async function handleHazards(
  supabaseAdmin: ReturnType<typeof createClient>,
  method: string,
  projectId: string,
  pathParts: string[],
  params: URLSearchParams,
  body: unknown,
  scopes: string[]
) {
  if (method === "GET" && !scopes.includes("read:hazards") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: read:hazards" } } };
  }
  if ((method === "POST" || method === "PUT") && !scopes.includes("write:hazards") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: write:hazards" } } };
  }

  if (method === "GET" && pathParts.length === 0) {
    let query = supabaseAdmin.from("hazards").select("*", { count: "exact" }).eq("project_id", projectId);

    const severity = params.get("severity");
    if (severity) query = query.eq("severity", severity);
    const riskLevel = params.get("risk_level");
    if (riskLevel) query = query.eq("risk_level", riskLevel);
    const ceId = params.get("ce_id");
    if (ceId) query = query.eq("ce_id", ceId);

    const limit = Math.min(parseInt(params.get("limit") || "50"), 100);
    const offset = parseInt(params.get("offset") || "0");
    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

    const { data, error, count } = await query;
    if (error) return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: error.message } } };
    return { status: 200, body: { data, meta: { total: count, limit, offset } } };
  }

  if (method === "POST" && pathParts.length === 0) {
    const hazardData = body as Record<string, unknown>;
    const { data, error } = await supabaseAdmin
      .from("hazards")
      .insert({ ...hazardData, project_id: projectId })
      .select()
      .single();
    if (error) return { status: 422, body: { error: { code: "VALIDATION_ERROR", message: error.message } } };
    return { status: 201, body: { data } };
  }

  return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint not found" } } };
}

async function handleRequirements(
  supabaseAdmin: ReturnType<typeof createClient>,
  method: string,
  projectId: string,
  pathParts: string[],
  params: URLSearchParams,
  body: unknown,
  scopes: string[]
) {
  if (method === "GET" && !scopes.includes("read:requirements") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: read:requirements" } } };
  }

  if (method === "GET" && pathParts.length === 0) {
    let query = supabaseAdmin.from("requirements").select("*", { count: "exact" }).eq("project_id", projectId);

    const type = params.get("type");
    if (type) query = query.eq("type", type);
    const status = params.get("status");
    if (status) query = query.eq("status", status);

    const limit = Math.min(parseInt(params.get("limit") || "50"), 100);
    const offset = parseInt(params.get("offset") || "0");
    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

    const { data, error, count } = await query;
    if (error) return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: error.message } } };
    return { status: 200, body: { data, meta: { total: count, limit, offset } } };
  }

  return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint not found" } } };
}

async function handleTestCases(
  supabaseAdmin: ReturnType<typeof createClient>,
  method: string,
  projectId: string,
  pathParts: string[],
  params: URLSearchParams,
  body: unknown,
  scopes: string[]
) {
  if (!scopes.includes("read:test_cases") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: read:test_cases" } } };
  }

  if (method === "GET" && pathParts.length === 0) {
    let query = supabaseAdmin.from("test_cases").select("*", { count: "exact" }).eq("project_id", projectId);

    const result = params.get("result");
    if (result) query = query.eq("status", result);

    const limit = Math.min(parseInt(params.get("limit") || "50"), 100);
    const offset = parseInt(params.get("offset") || "0");
    query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

    const { data, error, count } = await query;
    if (error) return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: error.message } } };
    return { status: 200, body: { data, meta: { total: count, limit, offset } } };
  }

  return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint not found" } } };
}

async function handleCertifiableElements(
  supabaseAdmin: ReturnType<typeof createClient>,
  method: string,
  projectId: string,
  pathParts: string[],
  params: URLSearchParams,
  _body: unknown,
  scopes: string[]
) {
  if (!scopes.includes("read:certifiable_elements") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: read:certifiable_elements" } } };
  }

  if (method === "GET" && pathParts.length === 0) {
    let query = supabaseAdmin.from("certifiable_elements").select("*", { count: "exact" }).eq("project_id", projectId);

    const sil = params.get("sil");
    if (sil) query = query.eq("sil_target", sil);
    const type = params.get("type");
    if (type) query = query.eq("type", type);
    const status = params.get("status");
    if (status) query = query.eq("status", status);

    const limit = Math.min(parseInt(params.get("limit") || "50"), 100);
    const offset = parseInt(params.get("offset") || "0");
    query = query.range(offset, offset + limit - 1).order("display_order");

    const { data, error, count } = await query;
    if (error) return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: error.message } } };
    return { status: 200, body: { data, meta: { total: count, limit, offset } } };
  }

  if (method === "GET" && pathParts.length === 2 && pathParts[1] === "traceability") {
    const ceId = pathParts[0];
    const { data: ce } = await supabaseAdmin.from("certifiable_elements").select("*").eq("id", ceId).single();
    const { data: hazards } = await supabaseAdmin.from("hazards").select("*").eq("ce_id", ceId);
    const { data: testCases } = await supabaseAdmin.from("test_cases").select("*").eq("ce_id", ceId);
    
    return {
      status: 200,
      body: {
        data: {
          ce,
          linked_hazards: hazards || [],
          linked_test_cases: testCases || [],
        },
      },
    };
  }

  return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint not found" } } };
}

async function handleCertification(
  supabaseAdmin: ReturnType<typeof createClient>,
  projectId: string,
  pathParts: string[],
  scopes: string[]
) {
  if (!scopes.includes("read:certificates") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope: read:certificates" } } };
  }

  if (pathParts[0] === "status") {
    const stats = await supabaseAdmin.rpc("get_project_stats", { p_project_id: projectId });
    return { status: 200, body: { data: stats.data } };
  }

  return { status: 404, body: { error: { code: "NOT_FOUND", message: "Endpoint not found" } } };
}

async function handleTraceability(
  supabaseAdmin: ReturnType<typeof createClient>,
  projectId: string,
  params: URLSearchParams,
  scopes: string[]
) {
  if (!scopes.includes("read:requirements") && !scopes.includes("*")) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: "Missing scope for traceability" } } };
  }

  const { data: hazards } = await supabaseAdmin.from("hazards").select("*").eq("project_id", projectId);
  const { data: requirements } = await supabaseAdmin.from("requirements").select("*").eq("project_id", projectId);
  const { data: testCases } = await supabaseAdmin.from("test_cases").select("*").eq("project_id", projectId);

  const chains = (hazards || []).map((h: Record<string, unknown>) => {
    const linkedReqs = (requirements || []).filter((r: Record<string, unknown>) => r.hazard_id === h.id);
    const linkedTests = (testCases || []).filter((t: Record<string, unknown>) =>
      linkedReqs.some((r: Record<string, unknown>) => r.id === t.requirement_id)
    );
    const isComplete = linkedReqs.length > 0 && linkedTests.length > 0;
    return {
      hazard: { uid: h.uid, title: h.title },
      requirements: linkedReqs.map((r: Record<string, unknown>) => ({ uid: r.uid, status: r.status })),
      test_cases: linkedTests.map((t: Record<string, unknown>) => ({ uid: t.uid, result: t.status })),
      chain_status: isComplete ? "complete" : "incomplete",
    };
  });

  const complete = chains.filter((c: { chain_status: string }) => c.chain_status === "complete").length;
  return {
    status: 200,
    body: {
      data: {
        chains,
        summary: {
          total_chains: chains.length,
          complete,
          incomplete: chains.length - complete,
          coverage: chains.length > 0 ? Math.round((complete / chains.length) * 100) / 100 : 0,
        },
      },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const url = new URL(req.url);
  const params = url.searchParams;

  // Parse API path: /api-gateway/v1/...
  const fullPath = url.pathname.replace(/^\/api-gateway\/?/, "");
  const pathSegments = fullPath.split("/").filter(Boolean);
  
  // Remove "v1" prefix if present
  if (pathSegments[0] === "v1") pathSegments.shift();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Authenticate via API key
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Api-Key ", "");

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Missing API key" } }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const keyRecord = await validateApiKey(supabaseAdmin, apiKey);
  if (!keyRecord) {
    return new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid or expired API key" } }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check rate limit
  const rateCheck = await checkRateLimit(supabaseAdmin, keyRecord.id, keyRecord.rate_limit_per_hour);
  const rateLimitHeaders = {
    "X-RateLimit-Limit": String(keyRecord.rate_limit_per_hour),
    "X-RateLimit-Remaining": String(rateCheck.remaining),
  };

  if (!rateCheck.allowed) {
    await logUsage(supabaseAdmin, keyRecord.id, fullPath, req.method, 429, Date.now() - startTime, req);
    return new Response(
      JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests" } }),
      { status: 429, headers: { ...corsHeaders, ...rateLimitHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse body for POST/PUT
  let body: unknown = null;
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }

  let result: { status: number; body: unknown };

  try {
    const resource = pathSegments[0];

    if (resource === "projects") {
      const remaining = pathSegments.slice(1);
      
      // Check for sub-resources: /projects/:id/hazards, etc.
      if (remaining.length >= 2) {
        const projectId = remaining[0];
        const subResource = remaining[1];
        const subParts = remaining.slice(2);

        switch (subResource) {
          case "hazards":
            result = await handleHazards(supabaseAdmin, req.method, projectId, subParts, params, body, keyRecord.scopes);
            break;
          case "requirements":
            result = await handleRequirements(supabaseAdmin, req.method, projectId, subParts, params, body, keyRecord.scopes);
            break;
          case "test-cases":
            result = await handleTestCases(supabaseAdmin, req.method, projectId, subParts, params, body, keyRecord.scopes);
            break;
          case "certifiable-elements":
            result = await handleCertifiableElements(supabaseAdmin, req.method, projectId, subParts, params, body, keyRecord.scopes);
            break;
          case "certification":
            result = await handleCertification(supabaseAdmin, projectId, subParts, keyRecord.scopes);
            break;
          case "traceability":
            result = await handleTraceability(supabaseAdmin, projectId, params, keyRecord.scopes);
            break;
          case "stats":
            result = await handleProjects(supabaseAdmin, req.method, [remaining[0], "stats"], params, body, keyRecord.scopes);
            break;
          default:
            result = { status: 404, body: { error: { code: "NOT_FOUND", message: `Unknown sub-resource: ${subResource}` } } };
        }
      } else {
        result = await handleProjects(supabaseAdmin, req.method, remaining, params, body, keyRecord.scopes);
      }
    } else {
      result = { status: 404, body: { error: { code: "NOT_FOUND", message: `Unknown resource: ${resource}` } } };
    }
  } catch (e) {
    result = { status: 500, body: { error: { code: "INTERNAL_ERROR", message: e.message } } };
  }

  const responseTimeMs = Date.now() - startTime;
  await logUsage(supabaseAdmin, keyRecord.id, fullPath, req.method, result.status, responseTimeMs, req);

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      ...corsHeaders,
      ...rateLimitHeaders,
      "Content-Type": "application/json",
      "X-Response-Time": `${responseTimeMs}ms`,
    },
  });
});
