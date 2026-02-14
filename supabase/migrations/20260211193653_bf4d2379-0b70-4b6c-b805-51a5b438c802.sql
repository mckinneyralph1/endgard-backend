
-- Account-level industry access table
CREATE TABLE public.account_industry_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  industry_id UUID NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  enabled_by UUID REFERENCES auth.users(id),
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, industry_id)
);

ALTER TABLE public.account_industry_access ENABLE ROW LEVEL SECURITY;

-- Security definer function to check account industry access
CREATE OR REPLACE FUNCTION public.account_has_industry_access(_account_id uuid, _industry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_industry_access
    WHERE account_id = _account_id AND industry_id = _industry_id
  )
$$;

-- Helper: check if current user's account has industry access
CREATE OR REPLACE FUNCTION public.user_account_has_industry_access(_user_id uuid, _industry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_industry_access aia
    JOIN public.account_members am ON am.account_id = aia.account_id
    WHERE am.user_id = _user_id AND aia.industry_id = _industry_id
  )
$$;

-- Update user_has_industry_access to also check account-level access
CREATE OR REPLACE FUNCTION public.user_has_industry_access(_user_id uuid, _industry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    -- Super admins have access to everything
    WHEN public.user_is_super_admin(_user_id) THEN true
    -- Managers have access to everything
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'manager'::app_role
    ) THEN true
    -- Regular users: account must have industry enabled AND user needs explicit access
    WHEN public.user_account_has_industry_access(_user_id, _industry_id)
      AND EXISTS (
        SELECT 1 FROM public.user_industry_access
        WHERE user_id = _user_id AND industry_id = _industry_id
      ) THEN true
    ELSE false
  END
$$;

-- RLS policies for account_industry_access
-- Super admins can do everything
CREATE POLICY "Super admins can manage account industry access"
ON public.account_industry_access
FOR ALL
USING (public.user_is_super_admin(auth.uid()));

-- Account members can view their account's industry access
CREATE POLICY "Account members can view their industry access"
ON public.account_industry_access
FOR SELECT
USING (public.user_belongs_to_account(auth.uid(), account_id));
