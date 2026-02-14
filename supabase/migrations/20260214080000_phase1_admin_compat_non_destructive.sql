-- Phase 1: Admin compatibility layer (non-destructive)
-- Objective: allow SaaS and Admin clients to run against one shared backend schema.
-- Constraints: no destructive removals, no contract-breaking renames.

-- 1) Enum compatibility for admin payloads/forms
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_tier') THEN
    ALTER TYPE public.plan_tier ADD VALUE IF NOT EXISTS 'free';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_member_role') THEN
    ALTER TYPE public.account_member_role ADD VALUE IF NOT EXISTS 'viewer';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2) Profile compatibility columns used by admin portal and billing functions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT;

-- Keep profile identities aligned for both client contracts
UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

UPDATE public.profiles
SET full_name = COALESCE(full_name, name)
WHERE full_name IS NULL;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id_unique
  ON public.profiles(user_id);

CREATE OR REPLACE FUNCTION public.sync_profile_identity_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.id := NEW.user_id;
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;

  -- Keep both identity columns locked together to preserve dual-client compatibility.
  IF NEW.id IS DISTINCT FROM NEW.user_id THEN
    NEW.user_id := NEW.id;
  END IF;

  IF NEW.full_name IS NULL AND NEW.name IS NOT NULL THEN
    NEW.full_name := NEW.name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_identity_columns ON public.profiles;
CREATE TRIGGER sync_profile_identity_columns
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_identity_columns();

-- 3) Projects compatibility columns expected by admin portal
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS industry_id UUID;

DO $$
BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_industry_id_fkey
    FOREIGN KEY (industry_id)
    REFERENCES public.standards_library_industries(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 4) Industry metadata compatibility
ALTER TABLE public.standards_library_industries ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.standards_library_industries ADD COLUMN IF NOT EXISTS icon TEXT;

UPDATE public.standards_library_industries
SET code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '_', 'g')) || '_' || SUBSTRING(id::TEXT, 1, 8)
WHERE code IS NULL;

CREATE INDEX IF NOT EXISTS idx_standards_library_industries_code
  ON public.standards_library_industries(code);

-- 5) Account-industry access table used by admin access controls
CREATE TABLE IF NOT EXISTS public.account_industry_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  industry_id UUID NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  enabled_by UUID NOT NULL,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, industry_id)
);

ALTER TABLE public.account_industry_access ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_industry_access'
      AND policyname = 'Super admins can manage account industry access'
  ) THEN
    CREATE POLICY "Super admins can manage account industry access"
    ON public.account_industry_access
    FOR ALL
    USING (has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_industry_access'
      AND policyname = 'Admins can view account industry access'
  ) THEN
    CREATE POLICY "Admins can view account industry access"
    ON public.account_industry_access
    FOR SELECT
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    );
  END IF;
END
$$;
