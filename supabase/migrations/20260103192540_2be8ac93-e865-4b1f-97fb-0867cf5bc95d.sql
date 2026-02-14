-- Add account_id to projects table
ALTER TABLE public.projects 
ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_projects_account_id ON public.projects(account_id);

-- Helper function to check if user belongs to an account
CREATE OR REPLACE FUNCTION public.user_belongs_to_account(_user_id uuid, _account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE user_id = _user_id AND account_id = _account_id
  )
$$;

-- Helper function to get user's account IDs
CREATE OR REPLACE FUNCTION public.get_user_account_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM public.account_members WHERE user_id = _user_id
$$;

-- Update projects RLS to include account-based access
DROP POLICY IF EXISTS "Users can view projects they have access to" ON public.projects;

CREATE POLICY "Users can view projects they have access to" ON public.projects
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    -- Existing project-level access
    public.user_has_project_access(auth.uid(), id)
    -- OR account-based access (user is member of the project's account)
    OR (account_id IS NOT NULL AND public.user_belongs_to_account(auth.uid(), account_id))
  )
);

-- Update insert policy to allow setting account_id
DROP POLICY IF EXISTS "Authenticated users can create projects" ON public.projects;

CREATE POLICY "Authenticated users can create projects" ON public.projects
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL 
  AND created_by = auth.uid()
  AND (
    account_id IS NULL 
    OR public.user_belongs_to_account(auth.uid(), account_id)
  )
);

-- Update policy for account members table to allow account owners to manage
DROP POLICY IF EXISTS "Account owners can manage members" ON public.account_members;

CREATE POLICY "Account owners can manage members" ON public.account_members
FOR ALL USING (
  auth.uid() IS NOT NULL AND (
    -- User is account owner
    EXISTS (
      SELECT 1 FROM public.accounts 
      WHERE id = account_id AND owner_id = auth.uid()
    )
    -- Or user is admin of the account
    OR EXISTS (
      SELECT 1 FROM public.account_members am
      WHERE am.account_id = account_members.account_id 
        AND am.user_id = auth.uid() 
        AND am.role = 'admin'
    )
  )
);