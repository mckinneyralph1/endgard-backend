import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Full 10-phase workflow with function mappings
const WORKFLOW_PHASES = [
  { step: 1, type: 'project_setup', name: 'Project Setup', requiresApproval: false, function: null },
  { step: 2, type: 'document_upload', name: 'Document Upload', requiresApproval: false, function: 'workflow-document-processor' },
  { step: 3, type: 'hazard_extraction', name: 'Hazard Extraction', requiresApproval: true, function: 'workflow-hazard-extractor' },
  { step: 4, type: 'requirement_extraction', name: 'Requirement Extraction', requiresApproval: true, function: 'workflow-requirement-extractor' },
  { step: 5, type: 'ce_structure_generation', name: 'CE Structure Generation', requiresApproval: true, function: 'generate-ce-from-document' },
  { step: 6, type: 'hazard_requirement_linking', name: 'Hazard-Requirement Linking', requiresApproval: true, function: 'workflow-traceability-engine' },
  { step: 7, type: 'requirement_ce_linking', name: 'Requirement-CE Linking', requiresApproval: true, function: 'workflow-traceability-engine' },
  { step: 8, type: 'conformance_generation', name: 'Conformance List Generation', requiresApproval: true, function: 'workflow-conformance-generator' },
  { step: 9, type: 'test_case_generation', name: 'Test Case Generation', requiresApproval: true, function: 'workflow-test-generator' },
  { step: 10, type: 'final_apply', name: 'Final Review & Apply', requiresApproval: true, function: 'workflow-final-apply' },
];

// Map step types to edge functions
const STEP_FUNCTIONS: Record<string, string> = {
  'document_upload': 'workflow-document-processor',
  'hazard_extraction': 'workflow-hazard-extractor',
  'requirement_extraction': 'workflow-requirement-extractor',
  'ce_structure_generation': 'generate-ce-from-document',
  'hazard_requirement_linking': 'workflow-traceability-engine',
  'requirement_ce_linking': 'workflow-traceability-engine',
  'conformance_generation': 'workflow-conformance-generator',
  'test_case_generation': 'workflow-test-generator',
  'final_apply': 'workflow-final-apply',
};

interface WorkflowConfig {
  projectId: string;
  industry?: string;
  framework?: string;
  systemContext?: string;
  sourceDocuments?: string[];
}

serve(async (req) => {
  // Handle CORS preflight
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, ...params } = await req.json();
    console.log(`Workflow orchestrator action: ${action}`, params);

    let result;

    switch (action) {
      case 'initiate':
        result = await initiateWorkflow(supabase, user.id, params);
        break;
      case 'status':
        result = await getWorkflowStatus(supabase, params.workflowId);
        break;
      case 'progress':
        result = await progressWorkflow(supabase, params.workflowId);
        break;
      case 'run_step':
        result = await runStepFunction(supabase, params.workflowId, params.stepId, params.projectId);
        break;
      case 'approve_step':
        result = await approveStep(supabase, user.id, params.stepId, params.projectId);
        break;
      case 'reject_step':
        result = await rejectStep(supabase, user.id, params.stepId, params.reason);
        break;
      case 'cancel':
        result = await cancelWorkflow(supabase, params.workflowId);
        break;
      case 'list':
        result = await listWorkflows(supabase, params.projectId);
        break;
      case 'apply_all':
        result = await applyAllArtifacts(supabase, user.id, params.workflowId, params.projectId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Workflow orchestrator error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Execute the edge function for a specific step
async function runStepFunction(
  supabase: any,
  workflowId: string,
  stepId: string,
  projectId: string
) {
  const { data: step } = await supabase
    .from('ai_workflow_steps')
    .select('*')
    .eq('id', stepId)
    .single();

  if (!step) throw new Error('Step not found');

  const functionName = STEP_FUNCTIONS[step.step_type];
  if (!functionName) {
    // No function for this step (e.g., project_setup)
    return { success: true, message: 'Step has no associated function' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  
  console.log(`Invoking ${functionName} for step ${stepId}`);
  
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      workflowRunId: workflowId,
      stepId: stepId,
      projectId: projectId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Function ${functionName} failed:`, errorText);
    
    // Update step with error
    await supabase
      .from('ai_workflow_steps')
      .update({
        status: 'error',
        error_message: errorText,
      })
      .eq('id', stepId);
    
    throw new Error(`Function ${functionName} failed: ${errorText}`);
  }

  const result = await response.json();
  console.log(`Function ${functionName} completed:`, result);

  return {
    success: true,
    functionName,
    result,
  };
}

// Apply all approved artifacts to project
async function applyAllArtifacts(
  supabase: any,
  userId: string,
  workflowId: string,
  projectId: string
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/workflow-final-apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      workflowRunId: workflowId,
      projectId: projectId,
      userId: userId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to apply artifacts: ${await response.text()}`);
  }

  return await response.json();
}

// Initiate a new workflow
async function initiateWorkflow(
  supabase: any, 
  userId: string, 
  config: WorkflowConfig
) {
  const { projectId, industry, framework, systemContext, sourceDocuments } = config;

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Check for existing active workflow
  const { data: existing } = await supabase
    .from('ai_workflow_runs')
    .select('id, status')
    .eq('project_id', projectId)
    .in('status', ['pending', 'running', 'paused', 'awaiting_approval'])
    .maybeSingle();

  if (existing) {
    throw new Error(`Active workflow already exists for this project (status: ${existing.status})`);
  }

  // Create workflow run
  const { data: workflow, error: workflowError } = await supabase
    .from('ai_workflow_runs')
    .insert({
      project_id: projectId,
      status: 'pending',
      current_phase: 'project_setup',
      initiated_by: userId,
      workflow_config: {
        industry,
        framework,
        systemContext,
        sourceDocuments: sourceDocuments || [],
      },
    })
    .select()
    .single();

  if (workflowError) {
    console.error('Error creating workflow:', workflowError);
    throw new Error('Failed to create workflow');
  }

  // Create all workflow steps
  const steps = WORKFLOW_PHASES.map(phase => ({
    workflow_run_id: workflow.id,
    step_type: phase.type,
    step_number: phase.step,
    step_name: phase.name,
    status: phase.step === 1 ? 'running' : 'pending',
    requires_approval: phase.requiresApproval,
    started_at: phase.step === 1 ? new Date().toISOString() : null,
  }));

  const { error: stepsError } = await supabase
    .from('ai_workflow_steps')
    .insert(steps);

  if (stepsError) {
    console.error('Error creating workflow steps:', stepsError);
    throw new Error('Failed to create workflow steps');
  }

  // Update workflow status to running
  await supabase
    .from('ai_workflow_runs')
    .update({ status: 'running' })
    .eq('id', workflow.id);

  console.log(`Workflow initiated: ${workflow.id}`);

  return {
    success: true,
    workflowId: workflow.id,
    message: 'Workflow initiated successfully',
    currentPhase: 'project_setup',
  };
}

// Get workflow status
async function getWorkflowStatus(supabase: any, workflowId: string) {
  if (!workflowId) {
    throw new Error('Workflow ID is required');
  }

  const { data: workflow, error: workflowError } = await supabase
    .from('ai_workflow_runs')
    .select('*')
    .eq('id', workflowId)
    .maybeSingle();

  if (workflowError || !workflow) {
    throw new Error('Workflow not found');
  }

  const { data: steps, error: stepsError } = await supabase
    .from('ai_workflow_steps')
    .select('*')
    .eq('workflow_run_id', workflowId)
    .order('step_number', { ascending: true });

  if (stepsError) {
    throw new Error('Failed to fetch workflow steps');
  }

  const { data: artifacts, error: artifactsError } = await supabase
    .from('ai_workflow_artifacts')
    .select('id, artifact_type, status, verification_method')
    .eq('workflow_run_id', workflowId);

  const completedSteps = steps.filter((s: any) => s.status === 'completed').length;
  const progress = Math.round((completedSteps / steps.length) * 100);

  return {
    workflow,
    steps,
    artifacts: artifacts || [],
    progress,
    summary: {
      totalSteps: steps.length,
      completedSteps,
      currentStep: steps.find((s: any) => s.status === 'running' || s.status === 'awaiting_approval'),
      pendingApprovals: steps.filter((s: any) => s.status === 'awaiting_approval').length,
    },
  };
}

// Progress workflow to next step
async function progressWorkflow(supabase: any, workflowId: string) {
  const status = await getWorkflowStatus(supabase, workflowId);
  const { workflow, steps } = status;

  if (workflow.status === 'completed' || workflow.status === 'cancelled') {
    throw new Error(`Workflow is ${workflow.status}`);
  }

  // Find current running step
  const currentStep = steps.find((s: any) => s.status === 'running');
  
  if (!currentStep) {
    // Check if we're awaiting approval
    const awaitingStep = steps.find((s: any) => s.status === 'awaiting_approval');
    if (awaitingStep) {
      return {
        success: false,
        message: `Step "${awaitingStep.step_name}" is awaiting approval`,
        awaitingApproval: true,
        stepId: awaitingStep.id,
      };
    }
    throw new Error('No active step found');
  }

  // Complete current step
  await supabase
    .from('ai_workflow_steps')
    .update({
      status: currentStep.requires_approval ? 'awaiting_approval' : 'completed',
      completed_at: currentStep.requires_approval ? null : new Date().toISOString(),
    })
    .eq('id', currentStep.id);

  if (currentStep.requires_approval) {
    // Update workflow status
    await supabase
      .from('ai_workflow_runs')
      .update({ status: 'awaiting_approval' })
      .eq('id', workflowId);

    return {
      success: true,
      message: `Step "${currentStep.step_name}" completed and awaiting approval`,
      awaitingApproval: true,
      stepId: currentStep.id,
    };
  }

  // Find next step
  const nextStep = steps.find((s: any) => s.step_number === currentStep.step_number + 1);

  if (!nextStep) {
    // Workflow complete
    await supabase
      .from('ai_workflow_runs')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_phase: 'completed',
      })
      .eq('id', workflowId);

    return {
      success: true,
      message: 'Workflow completed successfully',
      completed: true,
    };
  }

  // Start next step
  await supabase
    .from('ai_workflow_steps')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', nextStep.id);

  await supabase
    .from('ai_workflow_runs')
    .update({ current_phase: nextStep.step_type })
    .eq('id', workflowId);

  return {
    success: true,
    message: `Progressed to "${nextStep.step_name}"`,
    currentStep: nextStep,
  };
}

// Approve a step and optionally trigger next step's function
async function approveStep(supabase: any, userId: string, stepId: string, projectId?: string) {
  if (!stepId) {
    throw new Error('Step ID is required');
  }

  const { data: step, error: stepError } = await supabase
    .from('ai_workflow_steps')
    .select('*, workflow_run_id')
    .eq('id', stepId)
    .maybeSingle();

  if (stepError || !step) {
    throw new Error('Step not found');
  }

  if (step.status !== 'awaiting_approval') {
    throw new Error('Step is not awaiting approval');
  }

  // Approve all pending artifacts for this step
  await supabase
    .from('ai_workflow_artifacts')
    .update({ 
      status: 'approved',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('workflow_step_id', stepId)
    .eq('status', 'pending_review');

  // Mark step as completed
  await supabase
    .from('ai_workflow_steps')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', stepId);

  // Get all steps for this workflow
  const { data: allSteps } = await supabase
    .from('ai_workflow_steps')
    .select('*')
    .eq('workflow_run_id', step.workflow_run_id)
    .order('step_number', { ascending: true });

  // Find next pending step
  const nextStep = allSteps?.find((s: any) => s.status === 'pending');

  if (nextStep) {
    // Start next step
    await supabase
      .from('ai_workflow_steps')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', nextStep.id);

    await supabase
      .from('ai_workflow_runs')
      .update({ 
        status: 'running',
        current_phase: nextStep.step_type,
      })
      .eq('id', step.workflow_run_id);

    // Get project ID from workflow if not provided
    let pId = projectId;
    if (!pId) {
      const { data: workflow } = await supabase
        .from('ai_workflow_runs')
        .select('project_id')
        .eq('id', step.workflow_run_id)
        .single();
      pId = workflow?.project_id;
    }

    // Automatically run the next step's function
    if (pId && STEP_FUNCTIONS[nextStep.step_type]) {
      try {
        await runStepFunction(supabase, step.workflow_run_id, nextStep.id, pId);
      } catch (e) {
        console.error('Error running next step function:', e);
        // Don't fail the approval, just log the error
      }
    }

    return {
      success: true,
      message: `Step approved. Progressing to "${nextStep.step_name}"`,
      nextStep: nextStep,
    };
  }

  // No more steps - workflow complete
  await supabase
    .from('ai_workflow_runs')
    .update({ 
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_phase: 'completed',
    })
    .eq('id', step.workflow_run_id);

  return {
    success: true,
    message: 'Step approved. Workflow completed!',
    completed: true,
  };
}

// Reject a step
async function rejectStep(supabase: any, userId: string, stepId: string, reason: string) {
  if (!stepId) {
    throw new Error('Step ID is required');
  }

  const { data: step, error: stepError } = await supabase
    .from('ai_workflow_steps')
    .select('*, workflow_run_id')
    .eq('id', stepId)
    .maybeSingle();

  if (stepError || !step) {
    throw new Error('Step not found');
  }

  // Mark step as failed and reset to running for regeneration
  await supabase
    .from('ai_workflow_steps')
    .update({
      status: 'running',
      rejection_reason: reason,
      started_at: new Date().toISOString(),
    })
    .eq('id', stepId);

  // Update workflow status
  await supabase
    .from('ai_workflow_runs')
    .update({ status: 'running' })
    .eq('id', step.workflow_run_id);

  return {
    success: true,
    message: `Step rejected. Ready for regeneration. Reason: ${reason}`,
  };
}

// Cancel workflow
async function cancelWorkflow(supabase: any, workflowId: string) {
  if (!workflowId) {
    throw new Error('Workflow ID is required');
  }

  await supabase
    .from('ai_workflow_runs')
    .update({ 
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    })
    .eq('id', workflowId);

  return {
    success: true,
    message: 'Workflow cancelled',
  };
}

// List workflows for a project
async function listWorkflows(supabase: any, projectId: string) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const { data: workflows, error } = await supabase
    .from('ai_workflow_runs')
    .select(`
      *,
      ai_workflow_steps(id, step_type, step_name, status, step_number)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Failed to fetch workflows');
  }

  return {
    workflows: workflows || [],
    count: workflows?.length || 0,
  };
}