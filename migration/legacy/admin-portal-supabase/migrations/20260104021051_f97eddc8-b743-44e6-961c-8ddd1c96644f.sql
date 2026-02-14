-- Create user_permissions table
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage permissions"
ON public.user_permissions
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
USING (auth.uid() = user_id);

-- Create standards_library_industries table
CREATE TABLE public.standards_library_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.standards_library_industries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view industries"
ON public.standards_library_industries
FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage industries"
ON public.standards_library_industries
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create user_industry_access table
CREATE TABLE public.user_industry_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  industry_id UUID NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, industry_id)
);

ALTER TABLE public.user_industry_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage industry access"
ON public.user_industry_access
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view their own industry access"
ON public.user_industry_access
FOR SELECT
USING (auth.uid() = user_id);

-- Create feature_definitions table
CREATE TABLE public.feature_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  tier_available TEXT[],
  display_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature definitions"
ON public.feature_definitions
FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage feature definitions"
ON public.feature_definitions
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create accounts table
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  max_users INTEGER DEFAULT 5,
  max_projects INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage accounts"
ON public.accounts
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can view accounts"
ON public.accounts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create account_features table
CREATE TABLE public.account_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  enabled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, feature_key)
);

ALTER TABLE public.account_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage account features"
ON public.account_features
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can view account features"
ON public.account_features
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create account_members table
CREATE TABLE public.account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, user_id)
);

ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage account members"
ON public.account_members
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can view account members"
ON public.account_members
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  industry TEXT,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage projects"
ON public.projects
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can view projects"
ON public.projects
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Add name column to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN name TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'organization'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN organization TEXT;
  END IF;
END $$;

-- Add updated_at trigger for accounts
CREATE TRIGGER update_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for projects
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();