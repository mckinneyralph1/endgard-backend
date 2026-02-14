
-- Fix 1: Restrict profiles table - users can only see their own profile, managers can see all
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile or managers can view all"
ON public.profiles
FOR SELECT
USING (
  (auth.uid() = id) 
  OR current_user_has_role('manager'::app_role)
);
