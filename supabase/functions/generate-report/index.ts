import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limit store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; resetMs: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || record.resetTime < now) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, resetMs: windowMs };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, resetMs: record.resetTime - now };
  }

  record.count++;
  return { allowed: true, resetMs: record.resetTime - now };
}

interface Hazard {
  uid: string;
  title: string;
  severity: string;
  likelihood: string;
  description: string | null;
  mitigation: string | null;
}

interface ChecklistItem {
  title: string;
  category: string;
  completed: boolean;
}

interface TestCase {
  id: string;
  uid: string;
  title: string;
  status: string;
  test_type: string;
  requirement_id: string | null;
  hazard_id: string | null;
}

interface VerificationRecord {
  id: string;
  item_type: string;
  item_id: string;
  verification_method: string;
  verification_status: string;
  verifier_name: string | null;
  verifier_role: string | null;
  verifier_organization: string | null;
  notes: string | null;
}

interface Requirement {
  id: string;
  uid: string;
  title: string;
  status: string;
  priority: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { projectId, reportType } = body;

    if (!projectId || !reportType) {
      throw new Error("Missing required fields: projectId and reportType");
    }

    // Rate limiting: 5 reports per minute per project
    const rateLimit = checkRateLimit(`report:${projectId}`, 5, 60000);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetMs / 1000)} seconds.` 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[PERF] Starting report generation for project: ${projectId}, type: ${reportType}`);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all project data - extended for verification reports
    const fetchStart = Date.now();
    
    const [hazardsResult, checklistResult, testCasesResult, verificationRecordsResult, requirementsResult] = await Promise.all([
      supabase.from("hazards").select("*").eq("project_id", projectId),
      supabase.from("checklist_items").select("*").eq("project_id", projectId),
      supabase.from("test_cases").select("*").eq("project_id", projectId),
      supabase.from("verification_records").select("*").eq("project_id", projectId),
      supabase.from("requirements").select("*").eq("project_id", projectId),
    ]);

    console.log(`[PERF] Data fetch completed in ${Date.now() - fetchStart}ms`);

    const hazards: Hazard[] = hazardsResult.data || [];
    const checklistItems: ChecklistItem[] = checklistResult.data || [];
    const testCases: TestCase[] = testCasesResult.data || [];
    const verificationRecords: VerificationRecord[] = verificationRecordsResult.data || [];
    const requirements: Requirement[] = requirementsResult.data || [];

    // Calculate statistics
    const completedChecklist = checklistItems.filter((item: ChecklistItem) => item.completed);
    const completionRate = checklistItems.length 
      ? Math.round((completedChecklist.length / checklistItems.length) * 100)
      : 0;

    const highRiskHazards = hazards.filter((h: Hazard) => 
      h.severity === "catastrophic" || h.severity === "critical"
    );

    const mitigatedHazards = hazards.filter((h: Hazard) => 
      h.mitigation && h.mitigation.trim() !== ""
    );

    // Test case statistics
    const passedTests = testCases.filter((t: TestCase) => t.status === "passed");
    const failedTests = testCases.filter((t: TestCase) => t.status === "failed");
    const testPassRate = testCases.length
      ? Math.round((passedTests.length / testCases.length) * 100)
      : 0;

    // Verification record statistics
    const verifiedRecords = verificationRecords.filter((v: VerificationRecord) => v.verification_status === "verified");
    const pendingRecords = verificationRecords.filter((v: VerificationRecord) => v.verification_status === "pending");
    const verificationRate = verificationRecords.length
      ? Math.round((verifiedRecords.length / verificationRecords.length) * 100)
      : 0;

    // Data stats to return to client
    const dataStats = {
      hazards: hazards.length,
      testCases: testCases.length,
      verificationRecords: verificationRecords.length,
      checklistItems: checklistItems.length,
    };

    console.log("Project data:", {
      hazardsCount: hazards.length,
      checklistCount: checklistItems.length,
      testCasesCount: testCases.length,
      verificationRecordsCount: verificationRecords.length,
      requirementsCount: requirements.length,
      completionRate,
      testPassRate,
      verificationRate,
    });

    // Build context for AI based on report type
    let projectContext = "";
    
    if (reportType === "verification_report") {
      // Enhanced context for verification reports with citations
      projectContext = `
# Verification Report Data

## Summary Statistics
- Total Requirements: ${requirements.length}
- Total Hazards: ${hazards.length} (${highRiskHazards.length} high-risk, ${mitigatedHazards.length} mitigated)
- Total Test Cases: ${testCases.length}
  - Passed: ${passedTests.length} (${testPassRate}%)
  - Failed: ${failedTests.length}
- Verification Records: ${verificationRecords.length}
  - Verified: ${verifiedRecords.length} (${verificationRate}%)
  - Pending: ${pendingRecords.length}
- Checklist Completion: ${completedChecklist.length}/${checklistItems.length} (${completionRate}%)

## Requirements Coverage
${requirements.slice(0, 15).map((r: Requirement) => {
  const linkedTests = testCases.filter(t => t.requirement_id === r.id);
  const linkedVerifications = verificationRecords.filter(v => v.item_type === "requirement" && v.item_id === r.id);
  return `
### [REQ-${r.uid}] ${r.title}
- Status: ${r.status} | Priority: ${r.priority}
- Linked Tests: ${linkedTests.length} (${linkedTests.filter(t => t.status === "passed").length} passed)
- Verification Records: ${linkedVerifications.length} (${linkedVerifications.filter(v => v.verification_status === "verified").length} verified)`;
}).join("\n")}${requirements.length > 15 ? `\n... and ${requirements.length - 15} more requirements` : ''}

## Test Case Results (with citations)
${testCases.slice(0, 20).map((t: TestCase) => `
[TC-${t.uid}] ${t.title}
- Type: ${t.test_type} | Status: **${t.status.toUpperCase()}**
- Requirement Link: ${t.requirement_id ? `REQ linked` : "No requirement linked"}
- Hazard Link: ${t.hazard_id ? "HAZ linked" : "No hazard linked"}`).join("\n")}${testCases.length > 20 ? `\n... and ${testCases.length - 20} more test cases` : ''}

## Verification Evidence
${verificationRecords.slice(0, 15).map((v: VerificationRecord) => `
[VR-${v.id.slice(0,8)}] ${v.item_type} verification
- Method: ${v.verification_method}
- Status: **${v.verification_status}**
- Verifier: ${v.verifier_name || "Not assigned"} ${v.verifier_role ? `(${v.verifier_role})` : ""} ${v.verifier_organization ? `@ ${v.verifier_organization}` : ""}
- Notes: ${v.notes || "None"}`).join("\n")}${verificationRecords.length > 15 ? `\n... and ${verificationRecords.length - 15} more verification records` : ''}

## Hazard Traceability
${hazards.slice(0, 15).map((h: Hazard) => {
  const linkedTests = testCases.filter(t => t.hazard_id === h.uid);
  const linkedVerifications = verificationRecords.filter(v => v.item_type === "hazard" && v.item_id === h.uid);
  return `
[HAZ-${h.uid}] ${h.title}
- Risk: ${h.severity}/${h.likelihood}
- Mitigation: ${h.mitigation ? "Defined" : "MISSING"}
- Verification Tests: ${linkedTests.length}
- Verification Records: ${linkedVerifications.length}`;
}).join("\n")}${hazards.length > 15 ? `\n... and ${hazards.length - 15} more hazards` : ''}
`;
    } else {
      // Standard safety case context
      projectContext = `
# Safety Case Data

## Project Data Summary
- Total Hazards: ${hazards.length}
- High Risk Hazards: ${highRiskHazards.length}
- Mitigated Hazards: ${mitigatedHazards.length}
- Total Checklist Items: ${checklistItems.length}
- Completed Items: ${completedChecklist.length} (${completionRate}%)
- Test Cases: ${testCases.length} (${testPassRate}% pass rate)

## Hazards Detail
${hazards.slice(0, 20).map((h: Hazard) => `
[HAZ-${h.uid}] ${h.title}
- Severity: ${h.severity}
- Likelihood: ${h.likelihood}
- Description: ${h.description || "N/A"}
- Mitigation: ${h.mitigation || "Not yet defined"}`).join("\n")}${hazards.length > 20 ? `\n... and ${hazards.length - 20} more hazards` : ''}

## Checklist Status
${checklistItems.slice(0, 20).map((c: ChecklistItem) => `
- ${c.title} (${c.category}): ${c.completed ? "✓ Complete" : "⧖ Pending"}`).join("\n")}${checklistItems.length > 20 ? `\n... and ${checklistItems.length - 20} more items` : ''}
`;
    }

    let systemPrompt = "";
    let sections: Array<{ number: string; title: string; prompt: string }> = [];

    if (reportType === "safety_case") {
      systemPrompt = `You are a safety engineering expert generating a comprehensive Safety Case report.

Based on the project data provided, generate detailed content for each section of the safety case.
Be professional, thorough, and reference specific data from the project using citations like [HAZ-xxx], [REQ-xxx].

The safety case should:
- Provide evidence-based arguments for system safety
- Reference specific hazards and their mitigations with citations
- Highlight compliance status and gaps
- Be suitable for regulatory submission`;

      sections = [
        { number: "1", title: "Executive Summary", prompt: "Write an executive summary covering the safety case purpose, key findings, overall risk assessment, and recommendations." },
        { number: "2", title: "System Description", prompt: "Describe the system being certified, its purpose, operational environment, and key safety-critical components." },
        { number: "3", title: "Safety Requirements", prompt: "Summarize the safety requirements, standards compliance (FTA/APTA/EN), and verification approach." },
        { number: "4", title: "Hazard Analysis", prompt: "Provide detailed hazard analysis including hazard identification methodology and risk categorization. Reference specific hazards using [HAZ-xxx] citations." },
        { number: "5", title: "Risk Assessment", prompt: "Assess overall risk posture, risk levels by category, mitigation effectiveness, and residual risks. Cite specific hazards." },
        { number: "6", title: "Verification & Validation", prompt: "Detail verification approach, test coverage, checklist completion status. Reference test results and verification records." },
        { number: "7", title: "Conclusions", prompt: "Provide conclusions on safety case adequacy, readiness for deployment, and recommendations." },
      ];
    } else {
      // Enhanced verification report with citations and traceability
      systemPrompt = `You are a verification and certification specialist generating a comprehensive Verification Report.

Based on the project data provided, generate detailed content for each section. This report will be used for certification submission.

CRITICAL REQUIREMENTS:
- Include specific citations using [REQ-xxx], [HAZ-xxx], [TC-xxx], [VR-xxx] format
- Reference actual verification evidence and test results
- Provide traceability between requirements, hazards, tests, and verification records
- Be precise about pass/fail counts and verification status
- Highlight any gaps in verification coverage

The report should demonstrate complete verification evidence for certification.`;

      sections = [
        { number: "1", title: "Introduction", prompt: "Introduce the verification report scope, objectives, applicable standards, and document structure. Reference the project's compliance framework." },
        { number: "2", title: "Verification Strategy & Methods", prompt: "Define verification strategy, methods used (analysis, review, testing, demonstration), success criteria, and independence requirements. List verification methods from the records." },
        { number: "3", title: "Requirements Verification Matrix", prompt: "Create a requirements verification matrix showing each requirement's verification status. Use [REQ-xxx] citations. Include traceability to test cases and verification records." },
        { number: "4", title: "Hazard Verification & Mitigation Evidence", prompt: "For each hazard, document verification evidence that mitigations are effective. Use [HAZ-xxx] citations. Reference linked test cases and verification records." },
        { number: "5", title: "Test Execution Summary", prompt: "Summarize test execution results with pass/fail breakdown by test type. Use [TC-xxx] citations. Include test coverage analysis and any failed tests requiring attention." },
        { number: "6", title: "Verification Evidence Summary", prompt: "Compile verification evidence from verification records. Reference verifier credentials, methods, and dates. Use [VR-xxx] citations where applicable." },
        { number: "7", title: "Compliance Assessment", prompt: "Assess overall compliance status. Identify any gaps, deviations, or open items. Provide compliance percentages by category." },
        { number: "8", title: "Verification Conclusion & Certification Readiness", prompt: "Provide final verification conclusion. State whether the system is ready for certification. List any conditions, limitations, or recommendations for certification approval." },
      ];
    }

    console.log(`[PERF] Generating ${sections.length} sections with AI...`);

    const generatedSections = [];

    for (const section of sections) {
      const sectionStart = Date.now();
      
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { 
                role: "user", 
                content: `${projectContext}\n\nGenerate content for section "${section.number}. ${section.title}":\n${section.prompt}\n\nProvide detailed, professional content (200-400 words). Use markdown formatting.`
              },
            ],
          }),
        });

        if (!response.ok) {
          console.error(`AI error for section ${section.title}:`, response.status);
          
          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (response.status === 402) {
            return new Response(
              JSON.stringify({ error: "AI credits exhausted." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          throw new Error(`AI error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        generatedSections.push({
          section_number: section.number,
          title: section.title,
          content,
        });

        console.log(`[PERF] ✓ Section ${section.number}: ${Date.now() - sectionStart}ms`);
      } catch (error) {
        console.error(`[PERF] ✗ Section ${section.number} failed:`, error);
        
        generatedSections.push({
          section_number: section.number,
          title: section.title,
          content: `*Content generation failed. Please try again.*`,
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[PERF] Report generation complete in ${totalTime}ms`);

    return new Response(JSON.stringify({ 
      sections: generatedSections,
      _dataStats: dataStats,
      _performance: { totalMs: totalTime, sectionsGenerated: generatedSections.length }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ERROR] generate-report:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});