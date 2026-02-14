
-- Create account_industry_access table
CREATE TABLE public.account_industry_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  industry_id uuid NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  enabled_by uuid NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, industry_id)
);

-- Enable RLS
ALTER TABLE public.account_industry_access ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins can manage account industry access"
ON public.account_industry_access
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Admins can view
CREATE POLICY "Admins can view account industry access"
ON public.account_industry_access
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
