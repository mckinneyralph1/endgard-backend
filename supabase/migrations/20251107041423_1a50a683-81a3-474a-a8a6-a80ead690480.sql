-- Create checklist_approvals table for overall checklist approval
CREATE TABLE public.checklist_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  submitted_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  completion_percentage NUMERIC NOT NULL,
  total_items INTEGER NOT NULL,
  completed_items INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.checklist_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for checklist_approvals
CREATE POLICY "Anyone can view checklist approvals"
ON public.checklist_approvals
FOR SELECT
USING (true);

CREATE POLICY "Users can submit checklist for approval"
ON public.checklist_approvals
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Managers can update checklist approvals"
ON public.checklist_approvals
FOR UPDATE
USING (current_user_has_role('manager'::app_role));

-- Create indexes
CREATE INDEX idx_checklist_approvals_project_id ON public.checklist_approvals(project_id);
CREATE INDEX idx_checklist_approvals_status ON public.checklist_approvals(approval_status);
CREATE INDEX idx_checklist_approvals_submitted_date ON public.checklist_approvals(submitted_date DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_checklist_approvals_updated_at
BEFORE UPDATE ON public.checklist_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Drop existing policies that depend on approval_status
DROP POLICY IF EXISTS "Users can update non-approval fields" ON public.checklist_items;
DROP POLICY IF EXISTS "Managers can update all checklist items" ON public.checklist_items;

-- Recreate policies without approval_status
CREATE POLICY "Users can update checklist items"
ON public.checklist_items
FOR UPDATE
USING (true);

CREATE POLICY "Managers can update all checklist items"
ON public.checklist_items
FOR UPDATE
USING (current_user_has_role('manager'::app_role));

-- Remove approval_status columns from checklist_items
ALTER TABLE public.checklist_items DROP COLUMN IF EXISTS approval_status CASCADE;
ALTER TABLE public.checklist_items DROP COLUMN IF EXISTS approved_by;
ALTER TABLE public.checklist_items DROP COLUMN IF EXISTS approved_date;
ALTER TABLE public.checklist_items DROP COLUMN IF EXISTS rejection_reason;