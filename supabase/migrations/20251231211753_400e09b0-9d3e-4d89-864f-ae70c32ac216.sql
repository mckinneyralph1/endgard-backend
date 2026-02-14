-- Create project_members table for team membership
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  added_by UUID REFERENCES public.profiles(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Create index for fast lookups
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);

-- Enable RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Create helper function to check project access (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.user_has_project_access(_user_id UUID, _project_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Managers have access to everything
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'manager'::app_role
    ) THEN true
    -- Auditors with valid tokens have access
    WHEN public.auditor_has_project_access(_user_id, _project_id) THEN true
    -- Project creator has access
    WHEN EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = _project_id AND created_by = _user_id
    ) THEN true
    -- Project members have access
    WHEN EXISTS (
      SELECT 1 FROM public.project_members 
      WHERE project_id = _project_id AND user_id = _user_id
    ) THEN true
    ELSE false
  END
$$;

-- RLS policies for project_members table
CREATE POLICY "Users can view members of projects they have access to"
ON public.project_members FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "Project owners and admins can add members"
ON public.project_members FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_id = project_members.project_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Project owners and admins can update members"
ON public.project_members FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_members.project_id 
    AND pm.user_id = auth.uid() 
    AND pm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Project owners and admins can remove members"
ON public.project_members FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_id AND created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_members.project_id 
    AND pm.user_id = auth.uid() 
    AND pm.role IN ('owner', 'admin')
  )
);

-- Drop existing overly permissive policies and create project-based ones

-- PROJECTS table
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;
CREATE POLICY "Users can view projects they have access to"
ON public.projects FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), id));

-- REQUIREMENTS table
DROP POLICY IF EXISTS "Authenticated users can view requirements" ON public.requirements;
CREATE POLICY "Users can view requirements for accessible projects"
ON public.requirements FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id));

-- HAZARDS table
DROP POLICY IF EXISTS "Authenticated users can view hazards" ON public.hazards;
CREATE POLICY "Users can view hazards for accessible projects"
ON public.hazards FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id));

-- TEST_CASES table
DROP POLICY IF EXISTS "Authenticated users can view test cases" ON public.test_cases;
CREATE POLICY "Users can view test cases for accessible projects"
ON public.test_cases FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id));

-- CERTIFICATES table
DROP POLICY IF EXISTS "Authenticated users can view certificates" ON public.certificates;
CREATE POLICY "Users can view certificates for accessible projects"
ON public.certificates FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- VERIFICATION_RECORDS table
DROP POLICY IF EXISTS "Authenticated users can view verification records" ON public.verification_records;
CREATE POLICY "Users can view verification records for accessible projects"
ON public.verification_records FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id));

-- CHANGE_REQUESTS table
DROP POLICY IF EXISTS "Authenticated users can view change requests" ON public.change_requests;
CREATE POLICY "Users can view change requests for accessible projects"
ON public.change_requests FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- CHECKLIST_ITEMS table
DROP POLICY IF EXISTS "Authenticated users can view checklist items" ON public.checklist_items;
CREATE POLICY "Users can view checklist items for accessible projects"
ON public.checklist_items FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id));

-- PROJECT_BLOCKERS table
DROP POLICY IF EXISTS "Authenticated users can view blockers" ON public.project_blockers;
CREATE POLICY "Users can view blockers for accessible projects"
ON public.project_blockers FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- COMPLIANCE_VALIDATIONS table
DROP POLICY IF EXISTS "Authenticated users can view compliance validations" ON public.compliance_validations;
CREATE POLICY "Users can view compliance validations for accessible projects"
ON public.compliance_validations FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- DESIGN_RECORDS table
DROP POLICY IF EXISTS "Authenticated users can view design records" ON public.design_records;
CREATE POLICY "Users can view design records for accessible projects"
ON public.design_records FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- SPECIFICATIONS table
DROP POLICY IF EXISTS "Authenticated users can view specifications" ON public.specifications;
CREATE POLICY "Users can view specifications for accessible projects"
ON public.specifications FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- CERTIFIABLE_ELEMENTS table
DROP POLICY IF EXISTS "Authenticated users can view certifiable elements" ON public.certifiable_elements;
CREATE POLICY "Users can view certifiable elements for accessible projects"
ON public.certifiable_elements FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- CALENDAR_EVENTS table
DROP POLICY IF EXISTS "Authenticated users can view calendar events" ON public.calendar_events;
CREATE POLICY "Users can view calendar events for accessible projects"
ON public.calendar_events FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- Add trigger for updated_at
CREATE TRIGGER update_project_members_updated_at
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-add project creator as owner when project is created
CREATE OR REPLACE FUNCTION public.add_project_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_add_project_owner
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.add_project_creator_as_owner();