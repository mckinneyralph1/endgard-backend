-- Add approval stage for pre-verification/validation readiness
-- This creates a gate that must be approved before verification/validation can begin

CREATE TYPE public.approval_stage AS ENUM (
  'design_review',
  'construction_review', 
  'verification_readiness',
  'validation_readiness',
  'final_approval'
);

-- Add new table for stage-based approvals
CREATE TABLE public.stage_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  stage approval_stage NOT NULL,
  submitted_by TEXT NOT NULL,
  submitted_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  approved_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, stage)
);

-- Enable RLS
ALTER TABLE public.stage_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view stage approvals"
  ON public.stage_approvals
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can submit stage approvals"
  ON public.stage_approvals
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Managers can update stage approvals"
  ON public.stage_approvals
  FOR UPDATE
  USING (current_user_has_role('manager'));

-- Add trigger for updated_at
CREATE TRIGGER update_stage_approvals_updated_at
  BEFORE UPDATE ON public.stage_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();