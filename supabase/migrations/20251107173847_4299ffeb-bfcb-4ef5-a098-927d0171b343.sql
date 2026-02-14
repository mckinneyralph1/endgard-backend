-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Allow managers to view all profiles
CREATE POLICY "Managers can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.current_user_has_role('manager'::app_role));