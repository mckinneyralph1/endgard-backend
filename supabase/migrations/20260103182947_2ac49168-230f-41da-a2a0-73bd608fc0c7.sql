-- Enums for account management
CREATE TYPE public.plan_tier AS ENUM ('starter', 'professional', 'enterprise');
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled', 'paused');
CREATE TYPE public.account_member_role AS ENUM ('owner', 'admin', 'member');

-- Accounts table (organizations/tenants)
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES public.profiles(id),
  
  -- Subscription fields
  plan_tier plan_tier DEFAULT 'starter',
  subscription_status subscription_status DEFAULT 'trial',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
  current_period_ends_at TIMESTAMPTZ,
  
  -- Account limits
  max_users INT DEFAULT 5,
  max_projects INT DEFAULT 3,
  max_storage_mb INT DEFAULT 1000,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Account members (multi-user per account)
CREATE TABLE public.account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role account_member_role DEFAULT 'member',
  invited_by UUID REFERENCES public.profiles(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, user_id)
);

-- Usage tracking snapshots
CREATE TABLE public.account_usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  active_users INT DEFAULT 0,
  projects_count INT DEFAULT 0,
  storage_used_mb NUMERIC DEFAULT 0,
  ai_requests INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, snapshot_date)
);

-- Feature definitions catalog
CREATE TABLE public.feature_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tier_available TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-account feature overrides
CREATE TABLE public.account_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  feature_key TEXT NOT NULL REFERENCES public.feature_definitions(key),
  enabled BOOLEAN DEFAULT true,
  enabled_at TIMESTAMPTZ DEFAULT now(),
  enabled_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(account_id, feature_key)
);

-- Enable RLS on all tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_features ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts
CREATE POLICY "Managers and admins can view all accounts"
  ON public.accounts FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Account members can view their own account"
  ON public.accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members 
      WHERE account_id = accounts.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Managers and admins can manage accounts"
  ON public.accounts FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for account_members
CREATE POLICY "Managers and admins can view all account members"
  ON public.account_members FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Account members can view their co-members"
  ON public.account_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am 
      WHERE am.account_id = account_members.account_id AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers and admins can manage account members"
  ON public.account_members FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for usage snapshots
CREATE POLICY "Managers and admins can view all usage"
  ON public.account_usage_snapshots FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Managers and admins can manage usage"
  ON public.account_usage_snapshots FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for feature definitions (read-only for authenticated)
CREATE POLICY "Authenticated users can view feature definitions"
  ON public.feature_definitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and admins can manage feature definitions"
  ON public.feature_definitions FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for account features
CREATE POLICY "Managers and admins can view all account features"
  ON public.account_features FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Account members can view their account features"
  ON public.account_features FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_members am 
      WHERE am.account_id = account_features.account_id AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers and admins can manage account features"
  ON public.account_features FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Indexes for performance
CREATE INDEX idx_accounts_owner ON public.accounts(owner_id);
CREATE INDEX idx_accounts_slug ON public.accounts(slug);
CREATE INDEX idx_accounts_subscription_status ON public.accounts(subscription_status);
CREATE INDEX idx_account_members_account ON public.account_members(account_id);
CREATE INDEX idx_account_members_user ON public.account_members(user_id);
CREATE INDEX idx_account_usage_date ON public.account_usage_snapshots(account_id, snapshot_date);
CREATE INDEX idx_account_features_account ON public.account_features(account_id);

-- Trigger for updated_at
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial feature definitions
INSERT INTO public.feature_definitions (key, name, description, tier_available, display_order) VALUES
  ('ai_workflow', 'AI Workflow Automation', 'Automated document processing and requirement extraction', ARRAY['professional', 'enterprise'], 1),
  ('executive_dashboard', 'Executive Dashboard', 'Portfolio-level metrics and reporting', ARRAY['professional', 'enterprise'], 2),
  ('certification_agent', 'AI Certification Agent', 'Interactive AI assistant for compliance guidance', ARRAY['professional', 'enterprise'], 3),
  ('vr_visualization', 'VR/3D Hazard Visualization', 'Immersive hazard visualization tools', ARRAY['enterprise'], 4),
  ('sso_integration', 'SSO Integration', 'Single sign-on with enterprise identity providers', ARRAY['enterprise'], 5),
  ('api_access', 'REST API Access', 'Programmatic access to platform data', ARRAY['professional', 'enterprise'], 6),
  ('audit_export', 'Audit Export & Backup', 'Full project backup and audit trail export', ARRAY['starter', 'professional', 'enterprise'], 7),
  ('unlimited_projects', 'Unlimited Projects', 'No limit on number of projects', ARRAY['enterprise'], 8),
  ('priority_support', 'Priority Support', '24/7 priority support channel', ARRAY['enterprise'], 9),
  ('custom_branding', 'Custom Branding', 'White-label certificates and reports', ARRAY['enterprise'], 10);