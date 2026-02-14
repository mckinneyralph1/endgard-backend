-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Only managers can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only managers can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only managers can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view all roles" ON public.user_roles;

-- Create new policies that allow both admin and manager roles
CREATE POLICY "Admins and managers can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  current_user_has_role('admin'::app_role) OR 
  current_user_has_role('manager'::app_role)
);

CREATE POLICY "Admins and managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  current_user_has_role('admin'::app_role) OR 
  current_user_has_role('manager'::app_role)
);

CREATE POLICY "Admins and managers can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  current_user_has_role('admin'::app_role) OR 
  current_user_has_role('manager'::app_role)
);

CREATE POLICY "Admins and managers can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  current_user_has_role('admin'::app_role) OR 
  current_user_has_role('manager'::app_role)
);