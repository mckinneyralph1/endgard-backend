-- Fix infinite recursion in account_members RLS policies

-- Drop the self-referencing policy on account_members
DROP POLICY IF EXISTS "Account members can view their co-members" ON public.account_members;

-- Replace with a policy using the SECURITY DEFINER function (bypasses RLS)
CREATE POLICY "Account members can view their co-members"
ON public.account_members
FOR SELECT
USING (user_belongs_to_account(auth.uid(), account_id));

-- Also fix the accounts policy that references account_members (which triggers recursion)
DROP POLICY IF EXISTS "Account members can view their own account" ON public.accounts;

CREATE POLICY "Account members can view their own account"
ON public.accounts
FOR SELECT
USING (user_belongs_to_account(auth.uid(), id));

-- Fix account_features policy too
DROP POLICY IF EXISTS "Account members can view their account features" ON public.account_features;

CREATE POLICY "Account members can view their account features"
ON public.account_features
FOR SELECT
USING (user_belongs_to_account(auth.uid(), account_id));

-- Fix the account_members ALL policy that references accounts table (circular)
DROP POLICY IF EXISTS "Account owners can manage members" ON public.account_members;

CREATE POLICY "Account owners can manage members"
ON public.account_members
FOR ALL
USING (
  auth.uid() IS NOT NULL AND (
    user_is_super_admin(auth.uid()) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    user_belongs_to_account(auth.uid(), account_id)
  )
);