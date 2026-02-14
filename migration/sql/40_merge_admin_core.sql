-- Merge transformed admin-source data from migration_admin.* into public.*
-- Assumes SaaS source data has already been loaded into public as base.

-- 1) Profiles (canonicalize on user identity)
WITH normalized AS (
  SELECT
    COALESCE(user_id, id) AS canonical_user_id,
    email,
    full_name,
    COALESCE(name, full_name) AS name,
    organization,
    avatar_url,
    phone,
    stripe_customer_id,
    subscription_status,
    subscription_tier,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(user_id, id)
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM migration_admin.profiles
)
INSERT INTO public.profiles (
  id,
  user_id,
  email,
  full_name,
  name,
  organization,
  avatar_url,
  phone,
  stripe_customer_id,
  subscription_status,
  subscription_tier,
  created_at,
  updated_at
)
SELECT
  canonical_user_id,
  canonical_user_id,
  email,
  full_name,
  name,
  organization,
  avatar_url,
  phone,
  stripe_customer_id,
  subscription_status,
  subscription_tier,
  COALESCE(created_at, now()),
  COALESCE(updated_at, now())
FROM normalized
WHERE rn = 1
ON CONFLICT (id)
DO UPDATE SET
  email = COALESCE(EXCLUDED.email, public.profiles.email),
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
  name = COALESCE(EXCLUDED.name, public.profiles.name),
  organization = COALESCE(EXCLUDED.organization, public.profiles.organization),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
  phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
  stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, public.profiles.stripe_customer_id),
  subscription_status = COALESCE(EXCLUDED.subscription_status, public.profiles.subscription_status),
  subscription_tier = COALESCE(EXCLUDED.subscription_tier, public.profiles.subscription_tier),
  updated_at = GREATEST(public.profiles.updated_at, EXCLUDED.updated_at);

-- 2) Standards industries
INSERT INTO public.standards_library_industries (
  id,
  name,
  code,
  description,
  icon,
  created_at
)
SELECT
  id,
  name,
  code,
  description,
  icon,
  COALESCE(created_at, now())
FROM migration_admin.standards_library_industries
ON CONFLICT (id)
DO UPDATE SET
  name = COALESCE(EXCLUDED.name, public.standards_library_industries.name),
  code = COALESCE(EXCLUDED.code, public.standards_library_industries.code),
  description = COALESCE(EXCLUDED.description, public.standards_library_industries.description),
  icon = COALESCE(EXCLUDED.icon, public.standards_library_industries.icon);

-- 3) Accounts
INSERT INTO public.accounts (
  id,
  name,
  slug,
  owner_id,
  plan_tier,
  subscription_status,
  stripe_customer_id,
  max_users,
  max_projects,
  created_at,
  updated_at
)
SELECT
  id,
  name,
  slug,
  owner_id,
  plan_tier,
  subscription_status,
  stripe_customer_id,
  max_users,
  max_projects,
  COALESCE(created_at, now()),
  COALESCE(updated_at, now())
FROM migration_admin.accounts
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  owner_id = COALESCE(EXCLUDED.owner_id, public.accounts.owner_id),
  plan_tier = COALESCE(EXCLUDED.plan_tier, public.accounts.plan_tier),
  subscription_status = COALESCE(EXCLUDED.subscription_status, public.accounts.subscription_status),
  stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, public.accounts.stripe_customer_id),
  max_users = COALESCE(EXCLUDED.max_users, public.accounts.max_users),
  max_projects = COALESCE(EXCLUDED.max_projects, public.accounts.max_projects),
  updated_at = GREATEST(public.accounts.updated_at, EXCLUDED.updated_at);

-- 4) Feature definitions
INSERT INTO public.feature_definitions (
  id,
  key,
  name,
  description,
  tier_available,
  display_order,
  is_active,
  created_at
)
SELECT
  id,
  key,
  name,
  description,
  tier_available,
  display_order,
  is_active,
  COALESCE(created_at, now())
FROM migration_admin.feature_definitions
ON CONFLICT (key)
DO UPDATE SET
  name = COALESCE(EXCLUDED.name, public.feature_definitions.name),
  description = COALESCE(EXCLUDED.description, public.feature_definitions.description),
  tier_available = COALESCE(EXCLUDED.tier_available, public.feature_definitions.tier_available),
  display_order = COALESCE(EXCLUDED.display_order, public.feature_definitions.display_order),
  is_active = COALESCE(EXCLUDED.is_active, public.feature_definitions.is_active);

-- 5) Account features
INSERT INTO public.account_features (
  id,
  account_id,
  feature_key,
  enabled,
  enabled_at,
  created_at
)
SELECT
  id,
  account_id,
  feature_key,
  enabled,
  COALESCE(enabled_at, now()),
  COALESCE(created_at, now())
FROM migration_admin.account_features
ON CONFLICT (account_id, feature_key)
DO UPDATE SET
  enabled = EXCLUDED.enabled,
  enabled_at = GREATEST(public.account_features.enabled_at, EXCLUDED.enabled_at);

-- 6) Account members (map to canonical user identity)
INSERT INTO public.account_members (
  id,
  account_id,
  user_id,
  role,
  joined_at
)
SELECT
  am.id,
  am.account_id,
  COALESCE(p.user_id, p.id, am.user_id) AS canonical_user_id,
  am.role,
  COALESCE(am.joined_at, now())
FROM migration_admin.account_members am
LEFT JOIN migration_admin.profiles p
  ON p.id = am.user_id OR p.user_id = am.user_id
WHERE am.role::text IN (
  SELECT unnest(enum_range(NULL::public.account_member_role))::text
)
ON CONFLICT (account_id, user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  joined_at = LEAST(public.account_members.joined_at, EXCLUDED.joined_at);

-- 7) Projects
INSERT INTO public.projects (
  id,
  account_id,
  code,
  name,
  industry,
  industry_id,
  standard,
  compliance_framework,
  status,
  is_archived,
  target_date,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  account_id,
  code,
  name,
  industry,
  industry_id,
  standard,
  compliance_framework,
  status,
  COALESCE(is_archived, false),
  target_date,
  created_by,
  COALESCE(created_at, now()),
  COALESCE(updated_at, now())
FROM migration_admin.projects
ON CONFLICT (id)
DO UPDATE SET
  account_id = COALESCE(EXCLUDED.account_id, public.projects.account_id),
  code = COALESCE(EXCLUDED.code, public.projects.code),
  name = COALESCE(EXCLUDED.name, public.projects.name),
  industry = COALESCE(EXCLUDED.industry, public.projects.industry),
  industry_id = COALESCE(EXCLUDED.industry_id, public.projects.industry_id),
  standard = COALESCE(EXCLUDED.standard, public.projects.standard),
  compliance_framework = COALESCE(EXCLUDED.compliance_framework, public.projects.compliance_framework),
  status = COALESCE(EXCLUDED.status, public.projects.status),
  is_archived = COALESCE(EXCLUDED.is_archived, public.projects.is_archived),
  target_date = COALESCE(EXCLUDED.target_date, public.projects.target_date),
  updated_at = GREATEST(public.projects.updated_at, EXCLUDED.updated_at);

-- 8) Roles
INSERT INTO public.user_roles (user_id, role, created_at)
SELECT DISTINCT
  COALESCE(p.user_id, p.id, ur.user_id) AS canonical_user_id,
  ur.role::public.app_role,
  COALESCE(ur.created_at, now())
FROM migration_admin.user_roles ur
LEFT JOIN migration_admin.profiles p
  ON p.id = ur.user_id OR p.user_id = ur.user_id
WHERE ur.role::text IN (
  SELECT unnest(enum_range(NULL::public.app_role))::text
)
ON CONFLICT (user_id, role) DO NOTHING;

-- 9) Permissions
INSERT INTO public.user_permissions (user_id, permission, created_at)
SELECT DISTINCT
  COALESCE(p.user_id, p.id, up.user_id) AS canonical_user_id,
  up.permission::public.app_permission,
  COALESCE(up.created_at, now())
FROM migration_admin.user_permissions up
LEFT JOIN migration_admin.profiles p
  ON p.id = up.user_id OR p.user_id = up.user_id
WHERE up.permission::text IN (
  SELECT unnest(enum_range(NULL::public.app_permission))::text
)
ON CONFLICT (user_id, permission) DO NOTHING;

-- 10) User industry access
INSERT INTO public.user_industry_access (
  id,
  user_id,
  industry_id,
  created_at
)
SELECT
  uia.id,
  COALESCE(p.user_id, p.id, uia.user_id) AS canonical_user_id,
  uia.industry_id,
  COALESCE(uia.created_at, now())
FROM migration_admin.user_industry_access uia
LEFT JOIN migration_admin.profiles p
  ON p.id = uia.user_id OR p.user_id = uia.user_id
ON CONFLICT (user_id, industry_id) DO NOTHING;

-- 11) Account industry access
INSERT INTO public.account_industry_access (
  id,
  account_id,
  industry_id,
  enabled_by,
  enabled_at
)
SELECT
  aia.id,
  aia.account_id,
  aia.industry_id,
  COALESCE(p.user_id, p.id, aia.enabled_by) AS canonical_enabled_by,
  COALESCE(aia.enabled_at, now())
FROM migration_admin.account_industry_access aia
LEFT JOIN migration_admin.profiles p
  ON p.id = aia.enabled_by OR p.user_id = aia.enabled_by
ON CONFLICT (account_id, industry_id)
DO UPDATE SET
  enabled_by = EXCLUDED.enabled_by,
  enabled_at = GREATEST(public.account_industry_access.enabled_at, EXCLUDED.enabled_at);
