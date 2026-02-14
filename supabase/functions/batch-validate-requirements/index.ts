import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Weak language terms from reference model
const weakTerms = [
  "operator shall", "personnel shall", "user shall", "driver shall", "maintainer shall",
  "ensure", "verify", "adequate", "sufficient", "as needed", "where practicable",
  "should", "may", "might", "could", "try", "attempt", "consider", "strive"
];

// Constraint terms that indicate proper system behavior requirements
const constraintTerms = [
  "shall prevent", "shall inhibit", "shall not allow", "shall be incapable of",
  "shall limit", "shall restrict", "shall detect", "shall isolate", "shall contain"
];

function detectWeakLanguage(text: string): { hasWeak: boolean; flags: string[] } {
  const textLower = text.toLowerCase();
  const flags: string[] = [];
  
  for (const term of weakTerms) {
    if (textLower.includes(term)) {
      flags.push(term);
    }
  }
  
  return { hasWeak: flags.length > 0, flags };
}

function checkConstraintLanguage(text: string): boolean {
  const textLower = text.toLowerCase();
  return constraintTerms.some(term => textLower.includes(term));
}

function checkHumanIndependence(text: string): boolean {
  const humanDependentPhrases = [
    "operator shall", "personnel shall", "user shall", "driver shall", 
    "maintainer shall", "staff shall", "worker shall", "crew shall"
  ];
  const textLower = text.toLowerCase();
  return !humanDependentPhrases.some(phrase => textLower.includes(phrase));
}

function checkVerifiability(text: string, verificationMethod: string | null): boolean {
  // Check for quantitative patterns
  const quantitativePatterns = [
    /\d+\s*(ms|milliseconds?|s|seconds?|minutes?|hours?)/i,
    /\d+\s*%/,
    /\d+\s*(m|meters?|ft|feet|km|miles?)/i,
    /\bSIL[- ]?[1-4]\b/i,
    /10\^?-?\d+/i,
    /\d+\s*(V|volts?|A|amps?|W|watts?)/i,
    /\d+\s*(kg|lbs?|pounds?|N|newtons?)/i
  ];
  
  const hasQuantitative = quantitativePatterns.some(p => p.test(text));
  const hasVerificationMethod = verificationMethod && verificationMethod.length > 0 && verificationMethod !== "none";
  
  return hasQuantitative || !!hasVerificationMethod;
}

function checkContext(text: string): boolean {
  const contextPatterns = [
    /\bwhen\b/i,
    /\bif\b/i,
    /\bduring\b/i,
    /\bupon\b/i,
    /\bin\s+the\s+event\s+of\b/i,
    /\bunder\s+(normal|abnormal|degraded|emergency)\s+(conditions?|operations?|mode)\b/i
  ];
  return contextPatterns.some(p => p.test(text));
}

function calculateQualityScore(
  hasWeak: boolean,
  hasConstraint: boolean,
  isHumanIndependent: boolean,
  isVerifiable: boolean,
  hasContext: boolean
): number {
  let score = 0;
  
  if (!hasWeak) score += 2; // No weak language
  if (hasConstraint) score += 2; // Has constraint language
  if (isHumanIndependent) score += 2; // Doesn't rely on humans
  if (isVerifiable) score += 2; // Has verifiable criteria
  if (hasContext) score += 2; // Has operational context
  
  return score; // Max 10
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id } = await req.json();
    
    if (!project_id) {
      return new Response(
        JSON.stringify({ error: 'project_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting batch validation for project: ${project_id}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all requirements for the project
    const { data: requirements, error: fetchError } = await supabase
      .from('requirements')
      .select('id, uid, title, description, verification_method, status')
      .eq('project_id', project_id);

    if (fetchError) {
      console.error('Error fetching requirements:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${requirements?.length || 0} requirements to validate`);

    const results: Array<{
      uid: string;
      title: string;
      quality_score: number;
      issues: string[];
      status: 'PASS' | 'FLAG' | 'REJECT';
    }> = [];

    // Validate each requirement
    for (const req of requirements || []) {
      const text = `${req.title || ''} ${req.description || ''}`;
      
      const { hasWeak, flags } = detectWeakLanguage(text);
      const hasConstraint = checkConstraintLanguage(text);
      const isHumanIndependent = checkHumanIndependence(text);
      const isVerifiable = checkVerifiability(text, req.verification_method);
      const hasContext = checkContext(text);
      
      const qualityScore = calculateQualityScore(
        hasWeak, hasConstraint, isHumanIndependent, isVerifiable, hasContext
      );

      const issues: string[] = [];
      if (hasWeak) issues.push(`Weak language: ${flags.join(', ')}`);
      if (!hasConstraint) issues.push('Missing constraint language');
      if (!isHumanIndependent) issues.push('Relies on human action');
      if (!isVerifiable) issues.push('Not objectively verifiable');
      if (!hasContext && text.length > 50) issues.push('Missing operational context');

      let status: 'PASS' | 'FLAG' | 'REJECT' = 'PASS';
      if (!isHumanIndependent && hasWeak) status = 'REJECT';
      else if (issues.length > 0) status = 'FLAG';

      // Update the requirement in database
      const { error: updateError } = await supabase
        .from('requirements')
        .update({
          quality_score: qualityScore,
          is_preventive_constraint: hasConstraint,
          is_human_independent: isHumanIndependent,
          is_objectively_verifiable: isVerifiable,
          has_clear_context: hasContext,
          has_weak_language: hasWeak,
          weak_language_flags: flags.length > 0 ? flags : null
        })
        .eq('id', req.id);

      if (updateError) {
        console.error(`Error updating requirement ${req.uid}:`, updateError);
      }

      results.push({
        uid: req.uid,
        title: req.title,
        quality_score: qualityScore,
        issues,
        status
      });
    }

    // Calculate summary stats
    const passCount = results.filter(r => r.status === 'PASS').length;
    const flagCount = results.filter(r => r.status === 'FLAG').length;
    const rejectCount = results.filter(r => r.status === 'REJECT').length;
    const avgScore = results.length > 0 
      ? Math.round(results.reduce((sum, r) => sum + r.quality_score, 0) / results.length * 10) / 10
      : 0;

    console.log(`Validation complete. PASS: ${passCount}, FLAG: ${flagCount}, REJECT: ${rejectCount}, Avg Score: ${avgScore}/10`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.length,
          passed: passCount,
          flagged: flagCount,
          rejected: rejectCount,
          averageScore: avgScore,
          maxScore: 10
        },
        topIssues: [
          { issue: 'Missing constraint language', count: results.filter(r => r.issues.includes('Missing constraint language')).length },
          { issue: 'Not objectively verifiable', count: results.filter(r => r.issues.includes('Not objectively verifiable')).length },
          { issue: 'Missing operational context', count: results.filter(r => r.issues.includes('Missing operational context')).length },
          { issue: 'Relies on human action', count: results.filter(r => r.issues.includes('Relies on human action')).length },
          { issue: 'Weak language detected', count: results.filter(r => r.issues.some(i => i.startsWith('Weak language'))).length }
        ],
        results: results.slice(0, 50) // Return first 50 for display
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Batch validation error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
