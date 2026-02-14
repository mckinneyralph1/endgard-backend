-- Drop existing SELECT policies to recreate with explicit authentication
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;

-- Recreate policies with explicit authentication requirement
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Managers can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (public.current_user_has_role('manager'::app_role));