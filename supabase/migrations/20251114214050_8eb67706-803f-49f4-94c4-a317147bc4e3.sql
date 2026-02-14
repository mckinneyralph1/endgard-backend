-- Drop the manager policy
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;

-- Create admin-only policy for updating profiles
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (current_user_has_permission('admin'::app_permission));