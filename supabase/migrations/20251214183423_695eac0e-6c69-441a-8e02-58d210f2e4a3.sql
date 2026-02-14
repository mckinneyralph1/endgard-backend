-- Create auditor access tracking table for time-limited access tokens
CREATE TABLE public.auditor_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id text NOT NULL,
  granted_by uuid REFERENCES public.profiles(id) NOT NULL,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  access_scope text NOT NULL DEFAULT 'full_read',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auditor_access_tokens ENABLE ROW LEVEL SECURITY;

-- Auditor access log for compliance tracking
CREATE TABLE public.auditor_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auditor_access_log ENABLE ROW LEVEL SECURITY;

-- Function to check if user is an auditor
CREATE OR REPLACE FUNCTION public.user_is_auditor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'auditor'::app_role
  )
$$;

-- Function to check if user is an auditor with valid project access
CREATE OR REPLACE FUNCTION public.auditor_has_project_access(_user_id uuid, _project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auditor_access_tokens
    WHERE user_id = _user_id 
      AND project_id = _project_id
      AND expires_at > now()
      AND revoked_at IS NULL
  )
$$;

-- RLS policies for auditor_access_tokens
CREATE POLICY "Managers can view all access tokens"
ON public.auditor_access_tokens FOR SELECT
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Users can view their own access tokens"
ON public.auditor_access_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Managers can grant access tokens"
ON public.auditor_access_tokens FOR INSERT
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can revoke access tokens"
ON public.auditor_access_tokens FOR UPDATE
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete access tokens"
ON public.auditor_access_tokens FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- RLS policies for auditor_access_log
CREATE POLICY "Managers can view all audit logs"
ON public.auditor_access_log FOR SELECT
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Auditors can view their own logs"
ON public.auditor_access_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs"
ON public.auditor_access_log FOR INSERT
WITH CHECK (true);

-- Update existing table policies to allow auditor read access

-- Projects: Allow auditors with valid access tokens to view
CREATE POLICY "Auditors can view assigned projects"
ON public.projects FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), id::text)
);

-- Hazards: Allow auditors with valid project access
CREATE POLICY "Auditors can view project hazards"
ON public.hazards FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Requirements: Allow auditors with valid project access
CREATE POLICY "Auditors can view project requirements"
ON public.requirements FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Test Cases: Allow auditors with valid project access
CREATE POLICY "Auditors can view project test cases"
ON public.test_cases FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Certifiable Elements: Allow auditors with valid project access
CREATE POLICY "Auditors can view project CEs"
ON public.certifiable_elements FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Checklist Items: Allow auditors with valid project access
CREATE POLICY "Auditors can view project checklists"
ON public.checklist_items FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Project Blockers: Allow auditors with valid project access
CREATE POLICY "Auditors can view project blockers"
ON public.project_blockers FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Certificates: Allow auditors with valid project access
CREATE POLICY "Auditors can view project certificates"
ON public.certificates FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Stage Approvals: Allow auditors with valid project access
CREATE POLICY "Auditors can view project stage approvals"
ON public.stage_approvals FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Report Templates: Allow auditors with valid project access
CREATE POLICY "Auditors can view project reports"
ON public.report_templates FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Verification Records: Allow auditors with valid project access  
CREATE POLICY "Auditors can view project verification records"
ON public.verification_records FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  auditor_has_project_access(auth.uid(), project_id)
);

-- Test Procedures: Allow auditors to view procedures for accessible test cases
CREATE POLICY "Auditors can view test procedures"
ON public.test_procedures FOR SELECT
USING (
  user_is_auditor(auth.uid()) AND 
  EXISTS (
    SELECT 1 FROM public.test_cases tc
    WHERE tc.id = test_procedures.test_case_id
    AND auditor_has_project_access(auth.uid(), tc.project_id)
  )
);