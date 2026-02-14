import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationRecord {
  id: string;
  verification_method: string;
  verification_status: string;
  verification_date: string | null;
  verification_notes: string | null;
  verifier_name: string | null;
  verifier_role: string | null;
  verifier_organization: string | null;
  verifier_credentials: string | null;
  verification_documents: Array<{
    id: string;
    file_name: string;
    file_type: string;
    document_type: string;
    description: string | null;
  }>;
  verification_document_references: Array<{
    id: string;
    reference_type: string;
    document_title: string;
    section: string | null;
    page: string | null;
    quote: string | null;
    external_url: string | null;
  }>;
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  rationale: string;
  task_type?: string;
}

// Helper to categorize task type from recommendation action text
function categorizeTask(recommendation: Recommendation): string {
  const action = recommendation.action.toLowerCase();
  
  if (action.includes('evidence') || action.includes('document') || action.includes('upload') || action.includes('attach')) {
    return 'missing_evidence';
  }
  if (action.includes('update') || action.includes('revise') || action.includes('modify') || action.includes('correct')) {
    return 'update_required';
  }
  if (action.includes('review') || action.includes('approve') || action.includes('verify')) {
    return 'review_needed';
  }
  if (action.includes('document') || action.includes('record') || action.includes('write')) {
    return 'documentation';
  }
  return 'verification';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      testCaseId, 
      projectId, 
      standardId, 
      verificationRecordId,
      approvalThreshold = 80, 
      rejectionThreshold = 50 
    } = await req.json();
    
    if (!testCaseId || !projectId || !standardId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: testCaseId, projectId, standardId' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch test case details
    const { data: testCase, error: testCaseError } = await supabase
      .from('test_cases')
      .select('*')
      .eq('id', testCaseId)
      .single();

    if (testCaseError || !testCase) {
      console.error('Test case fetch error:', testCaseError);
      return new Response(
        JSON.stringify({ error: 'Test case not found' }), 
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch existing verification records for this test case (with evidence)
    console.log('Fetching verification records for test case:', testCaseId);
    const { data: verificationRecords, error: vrError } = await supabase
      .from('verification_records')
      .select(`
        *,
        verification_documents (*),
        verification_document_references (*)
      `)
      .eq('item_type', 'test_case')
      .eq('item_id', testCaseId);

    if (vrError) {
      console.error('Verification records fetch error:', vrError);
    }

    const records = (verificationRecords || []) as VerificationRecord[];
    console.log(`Found ${records.length} verification records`);

    // Build evidence context for AI
    let evidenceContext = '';
    if (records.length > 0) {
      evidenceContext = `
EXISTING VERIFICATION EVIDENCE:
Total Verification Records: ${records.length}

${records.map((vr, idx) => {
  const docs = vr.verification_documents || [];
  const refs = vr.verification_document_references || [];
  
  return `
Record ${idx + 1}:
- Method: ${vr.verification_method || 'Not specified'}
- Status: ${vr.verification_status || 'Not specified'}
- Date: ${vr.verification_date || 'Not recorded'}
- Verifier: ${vr.verifier_name || 'Unknown'} ${vr.verifier_role ? `(${vr.verifier_role})` : ''}
- Organization: ${vr.verifier_organization || 'Not specified'}
- Credentials: ${vr.verifier_credentials || 'Not specified'}
- Notes: ${vr.verification_notes || 'No notes'}
- Attached Documents: ${docs.length} files${docs.length > 0 ? '\n    ' + docs.map(d => `• ${d.file_name} (${d.document_type || d.file_type})`).join('\n    ') : ''}
- Document References: ${refs.length} references${refs.length > 0 ? '\n    ' + refs.map(r => `• ${r.document_title}${r.section ? `, Section: ${r.section}` : ''}${r.page ? `, Page: ${r.page}` : ''}`).join('\n    ') : ''}
`;
}).join('\n')}
`;
    } else {
      evidenceContext = `
EXISTING VERIFICATION EVIDENCE:
No verification records found for this test case. This is a significant gap in compliance documentation.
`;
    }

    // Calculate evidence statistics
    const totalDocs = records.reduce((sum, vr) => sum + (vr.verification_documents?.length || 0), 0);
    const totalRefs = records.reduce((sum, vr) => sum + (vr.verification_document_references?.length || 0), 0);
    const passedRecords = records.filter(vr => vr.verification_status === 'passed').length;
    const hasVerifierCredentials = records.some(vr => vr.verifier_credentials);

    // Fetch standard details
    const standardsMap: Record<string, { name: string; requirements: string[] }> = {
      'IEC_62278': {
        name: 'IEC 62278 - Railway applications - Specification and demonstration of reliability, availability, maintainability and safety (RAMS)',
        requirements: [
          'Test procedures must be documented with clear acceptance criteria',
          'Test cases must be traceable to requirements',
          'Test environment must be representative of operational conditions',
          'Test results must be recorded and analyzed',
          'Failed tests must be investigated and resolved',
          'Test procedures must specify prerequisites and test data',
          'Pass/fail criteria must be objective and measurable',
          'Verification evidence must be maintained with full traceability',
          'Independent verification may be required for high-SIL levels'
        ]
      },
      'DO-178C': {
        name: 'DO-178C - Software Considerations in Airborne Systems and Equipment Certification',
        requirements: [
          'Test procedures must verify all requirements',
          'Test cases must demonstrate requirement compliance',
          'Test coverage must be complete and documented',
          'Test independence must be maintained',
          'Test procedures must be repeatable',
          'Test results must be traceable to requirements',
          'Regression testing must be performed after changes',
          'Test evidence must be preserved for certification',
          'Verification activities must be documented with evidence'
        ]
      },
      'ISO_26262': {
        name: 'ISO 26262 - Road vehicles - Functional safety',
        requirements: [
          'Test procedures must address all safety requirements',
          'Test cases must verify safety mechanisms',
          'Test environment must simulate fault conditions',
          'Test coverage must meet ASIL requirements',
          'Test procedures must document safety analysis',
          'Test results must demonstrate safety compliance',
          'Fault injection testing must be performed',
          'Verification evidence must demonstrate due diligence',
          'Verifier independence requirements depend on ASIL level'
        ]
      }
    };

    const standard = standardsMap[standardId] || {
      name: standardId,
      requirements: ['Test cases must meet applicable standard requirements']
    };

    // Prepare enhanced context for AI analysis
    const testCaseContext = `
TEST CASE DETAILS:
- UID: ${testCase.uid}
- Title: ${testCase.title}
- Description: ${testCase.description || 'No description provided'}
- Test Type: ${testCase.test_type}
- Status: ${testCase.status}
- Execution Result: ${testCase.result || 'Not executed'}
- Executed Date: ${testCase.executed_date || 'Not executed'}
- Executed By: ${testCase.executed_by || 'Unknown'}
`;

    const standardContext = `
APPLICABLE STANDARD: ${standard.name}

Key Compliance Requirements:
${standard.requirements.map((req, idx) => `${idx + 1}. ${req}`).join('\n')}
`;

    const evidenceStats = `
EVIDENCE STATISTICS:
- Total Verification Records: ${records.length}
- Passed Verifications: ${passedRecords}
- Total Uploaded Documents: ${totalDocs}
- Total Document References: ${totalRefs}
- Has Verifier Credentials: ${hasVerifierCredentials ? 'Yes' : 'No'}
`;

    // Call OpenAI for enhanced compliance analysis
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const systemPrompt = `You are a compliance validation expert for transportation safety standards. Your task is to analyze test cases, their verification evidence, and procedures against applicable standards to provide structured compliance assessments.

When analyzing, carefully consider:
1. Existing verification records and their completeness
2. Quality and sufficiency of attached evidence (documents, references)
3. Verifier qualifications and organizational independence
4. Whether existing evidence sufficiently demonstrates compliance
5. Gaps in documentation, traceability, or evidence quality

Provide:
1. A compliance score (0-100) that reflects both test case quality AND evidence sufficiency
2. Specific findings covering both compliant and non-compliant aspects
3. An evidence assessment evaluating the quality of existing verification records
4. Actionable recommendations prioritized by importance
5. Overall compliance status

Be specific, cite standard requirements, and provide clear reasoning. If no verification evidence exists, this should significantly impact the compliance score.`;

    const userPrompt = `Please analyze this test case and its verification evidence for compliance with the specified standard:

${testCaseContext}

${evidenceContext}

${evidenceStats}

${standardContext}

Provide a detailed compliance assessment including an evaluation of the evidence quality.`;

    console.log('Calling AI gateway for compliance analysis...');
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'validate_compliance',
              description: 'Provide structured compliance validation results including evidence assessment',
              parameters: {
                type: 'object',
                properties: {
                  compliance_score: {
                    type: 'number',
                    description: 'Overall compliance score from 0 to 100, factoring in evidence quality',
                    minimum: 0,
                    maximum: 100
                  },
                  status: {
                    type: 'string',
                    enum: ['approved', 'requires_review', 'rejected'],
                    description: 'Overall compliance status'
                  },
                  evidence_assessment: {
                    type: 'object',
                    description: 'Assessment of existing verification evidence',
                    properties: {
                      has_sufficient_evidence: {
                        type: 'boolean',
                        description: 'Whether there is sufficient evidence to demonstrate compliance'
                      },
                      evidence_quality_score: {
                        type: 'number',
                        description: 'Quality score for existing evidence (0-100)',
                        minimum: 0,
                        maximum: 100
                      },
                      evidence_gaps: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Specific gaps in evidence documentation'
                      },
                      verifier_qualification_concerns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Concerns about verifier qualifications or independence'
                      },
                      strengths: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Positive aspects of existing evidence'
                      }
                    },
                    required: ['has_sufficient_evidence', 'evidence_quality_score', 'evidence_gaps']
                  },
                  findings: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        category: {
                          type: 'string',
                          description: 'Category of finding (e.g., documentation, traceability, coverage, evidence)'
                        },
                        severity: {
                          type: 'string',
                          enum: ['critical', 'major', 'minor', 'positive'],
                          description: 'Severity level of the finding'
                        },
                        description: {
                          type: 'string',
                          description: 'Detailed description of the finding'
                        },
                        standard_reference: {
                          type: 'string',
                          description: 'Reference to specific standard requirement'
                        }
                      },
                      required: ['category', 'severity', 'description']
                    }
                  },
                  recommendations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        priority: {
                          type: 'string',
                          enum: ['high', 'medium', 'low'],
                          description: 'Priority level of recommendation'
                        },
                        action: {
                          type: 'string',
                          description: 'Specific action to take'
                        },
                        rationale: {
                          type: 'string',
                          description: 'Explanation of why this is recommended'
                        }
                      },
                      required: ['priority', 'action', 'rationale']
                    }
                  }
                },
                required: ['compliance_score', 'status', 'evidence_assessment', 'findings', 'recommendations'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'validate_compliance' } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI Response received');

    // Extract structured output from tool call
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'validate_compliance') {
      throw new Error('Invalid AI response format');
    }

    const validationResult = JSON.parse(toolCall.function.arguments);
    console.log('Validation result:', JSON.stringify(validationResult, null, 2));

    // Apply user-defined thresholds to determine final status
    let finalStatus = validationResult.status;
    if (validationResult.compliance_score >= approvalThreshold) {
      finalStatus = 'approved';
    } else if (validationResult.compliance_score < rejectionThreshold) {
      finalStatus = 'rejected';
    } else {
      finalStatus = 'requires_review';
    }

    console.log(`Score: ${validationResult.compliance_score}, Thresholds: ${rejectionThreshold}-${approvalThreshold}, Status: ${finalStatus}`);

    // Store validation result in database with enhanced data
    const { data: validation, error: insertError } = await supabase
      .from('compliance_validations')
      .insert({
        test_case_id: testCaseId,
        project_id: projectId,
        standard: standard.name,
        compliance_score: validationResult.compliance_score,
        status: finalStatus,
        findings: validationResult.findings,
        recommendations: validationResult.recommendations,
        ai_model: 'gpt-4o',
        verification_record_id: verificationRecordId || null
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw new Error('Failed to store validation result');
    }

    console.log('Validation stored:', validation.id);

    // Auto-generate compliance tasks from high/medium priority recommendations
    const recommendations = validationResult.recommendations as Recommendation[];
    const tasksToCreate = recommendations
      .filter(rec => rec.priority === 'high' || rec.priority === 'medium')
      .map(rec => ({
        compliance_validation_id: validation.id,
        project_id: projectId,
        test_case_id: testCaseId,
        task_type: categorizeTask(rec),
        priority: rec.priority,
        action: rec.action,
        rationale: rec.rationale,
        status: 'pending'
      }));

    if (tasksToCreate.length > 0) {
      console.log(`Creating ${tasksToCreate.length} compliance tasks...`);
      const { error: tasksError } = await supabase
        .from('compliance_validation_tasks')
        .insert(tasksToCreate);

      if (tasksError) {
        console.error('Tasks insert error:', tasksError);
        // Non-fatal error - validation was successful
      } else {
        console.log('Compliance tasks created successfully');
      }
    }

    // If triggered from a specific verification record, update its compliance status
    if (verificationRecordId) {
      const { error: updateError } = await supabase
        .from('verification_records')
        .update({
          last_compliance_validation_id: validation.id,
          compliance_score: validationResult.compliance_score,
          compliance_status: finalStatus
        })
        .eq('id', verificationRecordId);

      if (updateError) {
        console.error('Verification record update error:', updateError);
      }
    }

    console.log('Validation completed successfully:', validation.id);

    return new Response(
      JSON.stringify({
        success: true,
        validation: {
          ...validation,
          evidence_assessment: validationResult.evidence_assessment
        },
        tasks_created: tasksToCreate.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Compliance validation error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
