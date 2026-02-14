-- Drop both manager and admin policies if they exist
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create admin-only policy for updating other users' profiles
CREATE POLICY "Only admins can update other profiles"
ON public.profiles
FOR UPDATE
USING (current_user_has_permission('admin'::app_permission));