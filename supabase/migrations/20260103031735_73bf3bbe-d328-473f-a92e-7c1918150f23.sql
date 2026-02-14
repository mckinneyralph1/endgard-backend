-- Drop existing INSERT policy for design_records
DROP POLICY IF EXISTS "Managers can insert design records" ON public.design_records;

-- Create new INSERT policy that allows managers, approvers, and admins
CREATE POLICY "Authorized users can insert design records" 
ON public.design_records 
FOR INSERT 
WITH CHECK (
  current_user_has_role('manager'::app_role) OR 
  current_user_has_role('admin'::app_role) OR
  current_user_has_role('approver'::app_role)
);

-- Also update UPDATE policy to include admin
DROP POLICY IF EXISTS "Managers can update design records" ON public.design_records;

CREATE POLICY "Authorized users can update design records" 
ON public.design_records 
FOR UPDATE 
USING (
  current_user_has_role('manager'::app_role) OR 
  current_user_has_role('admin'::app_role) OR
  current_user_has_role('approver'::app_role)
);

-- Also update DELETE policy to include admin
DROP POLICY IF EXISTS "Managers can delete design records" ON public.design_records;

CREATE POLICY "Authorized users can delete design records" 
ON public.design_records 
FOR DELETE 
USING (
  current_user_has_role('manager'::app_role) OR 
  current_user_has_role('admin'::app_role)
);