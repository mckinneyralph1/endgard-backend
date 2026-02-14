-- Helper function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.user_is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  )
$$;

-- Super admin policies for accounts table
DROP POLICY IF EXISTS "Super admins can manage all accounts" ON public.accounts;
CREATE POLICY "Super admins can manage all accounts" ON public.accounts
FOR ALL USING (
  auth.uid() IS NOT NULL AND public.user_is_super_admin(auth.uid())
);

-- Super admin policies for account_members table
DROP POLICY IF EXISTS "Super admins can manage all account members" ON public.account_members;
CREATE POLICY "Super admins can manage all account members" ON public.account_members
FOR ALL USING (
  auth.uid() IS NOT NULL AND public.user_is_super_admin(auth.uid())
);

-- Super admin policies for account_features table
DROP POLICY IF EXISTS "Super admins can manage all account features" ON public.account_features;
CREATE POLICY "Super admins can manage all account features" ON public.account_features
FOR ALL USING (
  auth.uid() IS NOT NULL AND public.user_is_super_admin(auth.uid())
);

-- Super admin policies for projects table (full access)
DROP POLICY IF EXISTS "Super admins can manage all projects" ON public.projects;
CREATE POLICY "Super admins can manage all projects" ON public.projects
FOR ALL USING (
  auth.uid() IS NOT NULL AND public.user_is_super_admin(auth.uid())
);

-- Super admin policies for profiles (to manage users)
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
CREATE POLICY "Super admins can view all profiles" ON public.profiles
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    id = auth.uid() 
    OR public.user_is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

-- Super admin policies for user_roles (to assign roles)
DROP POLICY IF EXISTS "Super admins can manage all user roles" ON public.user_roles;
CREATE POLICY "Super admins can manage all user roles" ON public.user_roles
FOR ALL USING (
  auth.uid() IS NOT NULL AND public.user_is_super_admin(auth.uid())
);