-- Phase 1: Database Schema Changes for Unified Compliance Validation & Verification Records

-- 1.1 Add verification_record_id to compliance_validations
-- Allows compliance validations to be triggered for a specific verification record
ALTER TABLE public.compliance_validations
ADD COLUMN verification_record_id UUID REFERENCES public.verification_records(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_compliance_validations_verification_record_id 
ON public.compliance_validations(verification_record_id);

-- 1.2 Add compliance tracking columns to verification_records
-- Track compliance state directly on verification records for quick filtering/display
ALTER TABLE public.verification_records
ADD COLUMN last_compliance_validation_id UUID REFERENCES public.compliance_validations(id) ON DELETE SET NULL,
ADD COLUMN compliance_score NUMERIC,
ADD COLUMN compliance_status TEXT CHECK (compliance_status IN ('pending', 'approved', 'requires_review', 'rejected'));

-- Create index for compliance status filtering
CREATE INDEX idx_verification_records_compliance_status 
ON public.verification_records(compliance_status);

-- 1.3 Create compliance_validation_tasks table
-- Converts AI recommendations into trackable tasks that can be assigned and completed
CREATE TABLE public.compliance_validation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_validation_id UUID NOT NULL REFERENCES public.compliance_validations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  test_case_id UUID NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('missing_evidence', 'update_required', 'review_needed', 'documentation', 'verification')),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  action TEXT NOT NULL,
  rationale TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),
  assigned_to TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  verification_record_id UUID REFERENCES public.verification_records(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX idx_compliance_validation_tasks_validation_id 
ON public.compliance_validation_tasks(compliance_validation_id);

CREATE INDEX idx_compliance_validation_tasks_project_id 
ON public.compliance_validation_tasks(project_id);

CREATE INDEX idx_compliance_validation_tasks_test_case_id 
ON public.compliance_validation_tasks(test_case_id);

CREATE INDEX idx_compliance_validation_tasks_status 
ON public.compliance_validation_tasks(status);

-- Enable RLS
ALTER TABLE public.compliance_validation_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for compliance_validation_tasks
CREATE POLICY "Anyone can view compliance validation tasks"
ON public.compliance_validation_tasks
FOR SELECT
USING (true);

CREATE POLICY "Managers can insert compliance validation tasks"
ON public.compliance_validation_tasks
FOR INSERT
WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update compliance validation tasks"
ON public.compliance_validation_tasks
FOR UPDATE
USING (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete compliance validation tasks"
ON public.compliance_validation_tasks
FOR DELETE
USING (public.current_user_has_role('manager'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_compliance_validation_tasks_updated_at
BEFORE UPDATE ON public.compliance_validation_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_validation_tasks;