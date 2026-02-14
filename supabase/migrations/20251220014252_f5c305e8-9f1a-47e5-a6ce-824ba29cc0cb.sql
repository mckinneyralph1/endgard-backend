-- Phase 1: AI Workflow Foundation Schema

-- Table to track workflow runs (one per project workflow instance)
CREATE TABLE public.ai_workflow_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  current_phase TEXT,
  initiated_by UUID REFERENCES public.profiles(id),
  initiated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  workflow_config JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to track individual steps within a workflow
CREATE TABLE public.ai_workflow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES public.ai_workflow_runs(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  input_data JSONB DEFAULT '{}',
  output_summary JSONB DEFAULT '{}',
  error_message TEXT,
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store generated artifacts pending review/application
CREATE TABLE public.ai_workflow_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES public.ai_workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES public.ai_workflow_steps(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'hazard', 'requirement', 'certifiable_element', 
    'traceability_link', 'dccc_item', 'cscc_item', 'orcc_item', 
    'evidence', 'test_case'
  )),
  artifact_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'applied')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  applied_at TIMESTAMP WITH TIME ZONE,
  target_table TEXT,
  target_id UUID,
  verification_method TEXT CHECK (verification_method IN ('analysis', 'inspection', 'demonstration', 'test')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_ai_workflow_runs_project ON public.ai_workflow_runs(project_id);
CREATE INDEX idx_ai_workflow_runs_status ON public.ai_workflow_runs(status);
CREATE INDEX idx_ai_workflow_steps_run ON public.ai_workflow_steps(workflow_run_id);
CREATE INDEX idx_ai_workflow_steps_status ON public.ai_workflow_steps(status);
CREATE INDEX idx_ai_workflow_artifacts_run ON public.ai_workflow_artifacts(workflow_run_id);
CREATE INDEX idx_ai_workflow_artifacts_step ON public.ai_workflow_artifacts(workflow_step_id);
CREATE INDEX idx_ai_workflow_artifacts_type ON public.ai_workflow_artifacts(artifact_type);
CREATE INDEX idx_ai_workflow_artifacts_status ON public.ai_workflow_artifacts(status);

-- Enable RLS
ALTER TABLE public.ai_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workflow_artifacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_workflow_runs
CREATE POLICY "Users can view workflow runs"
  ON public.ai_workflow_runs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create workflow runs"
  ON public.ai_workflow_runs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update workflow runs"
  ON public.ai_workflow_runs FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for ai_workflow_steps
CREATE POLICY "Users can view workflow steps"
  ON public.ai_workflow_steps FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create workflow steps"
  ON public.ai_workflow_steps FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update workflow steps"
  ON public.ai_workflow_steps FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for ai_workflow_artifacts
CREATE POLICY "Users can view workflow artifacts"
  ON public.ai_workflow_artifacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create workflow artifacts"
  ON public.ai_workflow_artifacts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update workflow artifacts"
  ON public.ai_workflow_artifacts FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Triggers for updated_at
CREATE TRIGGER update_ai_workflow_runs_updated_at
  BEFORE UPDATE ON public.ai_workflow_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_workflow_steps_updated_at
  BEFORE UPDATE ON public.ai_workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_workflow_artifacts_updated_at
  BEFORE UPDATE ON public.ai_workflow_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();