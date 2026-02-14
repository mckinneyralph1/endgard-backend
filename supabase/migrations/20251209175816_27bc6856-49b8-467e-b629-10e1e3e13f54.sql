-- Create table for project-level approver assignments
CREATE TABLE public.project_approvers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  function_type TEXT NOT NULL DEFAULT 'all', -- 'all', 'test_procedures', 'checklists', 'stages', 'certificates', 'blockers'
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, function_type)
);

-- Create table for task-level approval delegations
CREATE TABLE public.approval_delegations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delegation_type TEXT NOT NULL, -- 'single', 'batch', 'category'
  item_type TEXT NOT NULL, -- 'test_procedure', 'checklist_item', 'stage_approval', 'certificate', 'blocker'
  item_id UUID, -- NULL for category delegations
  category TEXT, -- For category-level delegations
  phase_id TEXT, -- For phase-level delegations
  project_id TEXT NOT NULL,
  delegated_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delegated_by UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_approvers
CREATE POLICY "Authenticated users can view project approvers"
ON public.project_approvers FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can insert project approvers"
ON public.project_approvers FOR INSERT
WITH CHECK (current_user_has_role('manager'::app_role) OR current_user_has_permission('admin'::app_permission));

CREATE POLICY "Managers and admins can update project approvers"
ON public.project_approvers FOR UPDATE
USING (current_user_has_role('manager'::app_role) OR current_user_has_permission('admin'::app_permission));

CREATE POLICY "Managers and admins can delete project approvers"
ON public.project_approvers FOR DELETE
USING (current_user_has_role('manager'::app_role) OR current_user_has_permission('admin'::app_permission));

-- RLS policies for approval_delegations
CREATE POLICY "Authenticated users can view their delegations"
ON public.approval_delegations FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can insert delegations"
ON public.approval_delegations FOR INSERT
WITH CHECK (current_user_has_role('manager'::app_role) OR current_user_has_permission('admin'::app_permission));

CREATE POLICY "Managers and admins can update delegations"
ON public.approval_delegations FOR UPDATE
USING (current_user_has_role('manager'::app_role) OR current_user_has_permission('admin'::app_permission));

CREATE POLICY "Managers and admins can delete delegations"
ON public.approval_delegations FOR DELETE
USING (current_user_has_role('manager'::app_role) OR current_user_has_permission('admin'::app_permission));

-- Create function to check if user can approve for a project/function
CREATE OR REPLACE FUNCTION public.user_can_approve(
  _user_id UUID,
  _project_id TEXT,
  _function_type TEXT DEFAULT 'all'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Managers can always approve
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'manager'::app_role
    ) THEN true
    -- Admins can always approve
    WHEN EXISTS (
      SELECT 1 FROM public.user_permissions 
      WHERE user_id = _user_id AND permission = 'admin'::app_permission
    ) THEN true
    -- Check project-level approver assignment (specific function)
    WHEN EXISTS (
      SELECT 1 FROM public.project_approvers
      WHERE project_id = _project_id 
        AND user_id = _user_id 
        AND function_type = _function_type
    ) THEN true
    -- Check project-level approver assignment (all functions)
    WHEN EXISTS (
      SELECT 1 FROM public.project_approvers
      WHERE project_id = _project_id 
        AND user_id = _user_id 
        AND function_type = 'all'
    ) THEN true
    ELSE false
  END
$$;

-- Create function to check if user has delegation for specific item
CREATE OR REPLACE FUNCTION public.user_has_delegation(
  _user_id UUID,
  _item_type TEXT,
  _item_id UUID,
  _project_id TEXT,
  _category TEXT DEFAULT NULL,
  _phase_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Check single item delegation
    WHEN EXISTS (
      SELECT 1 FROM public.approval_delegations
      WHERE delegated_to = _user_id 
        AND item_type = _item_type 
        AND item_id = _item_id
        AND delegation_type = 'single'
    ) THEN true
    -- Check category delegation
    WHEN _category IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.approval_delegations
      WHERE delegated_to = _user_id 
        AND item_type = _item_type 
        AND project_id = _project_id
        AND category = _category
        AND delegation_type = 'category'
    ) THEN true
    -- Check phase delegation
    WHEN _phase_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.approval_delegations
      WHERE delegated_to = _user_id 
        AND item_type = _item_type 
        AND project_id = _project_id
        AND phase_id = _phase_id
        AND delegation_type = 'category'
    ) THEN true
    ELSE false
  END
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_project_approvers_updated_at
BEFORE UPDATE ON public.project_approvers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_approval_delegations_updated_at
BEFORE UPDATE ON public.approval_delegations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();