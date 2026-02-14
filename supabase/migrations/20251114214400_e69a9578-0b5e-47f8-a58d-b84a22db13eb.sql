-- Drop all update policies on profiles
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Only admins can update other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Recreate policy allowing users to update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- Add policy allowing admins to update any profile
CREATE POLICY "Admin permission allows profile updates"
ON public.profiles
FOR UPDATE
USING (current_user_has_permission('admin'::app_permission));