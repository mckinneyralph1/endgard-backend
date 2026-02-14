-- Run on target after import/merge commit.
-- Returns counts and integrity checks that must all be zero where applicable.

SELECT 'profiles' AS table_name, COUNT(*) AS row_count FROM public.profiles
UNION ALL SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL SELECT 'user_permissions', COUNT(*) FROM public.user_permissions
UNION ALL SELECT 'accounts', COUNT(*) FROM public.accounts
UNION ALL SELECT 'account_members', COUNT(*) FROM public.account_members
UNION ALL SELECT 'account_features', COUNT(*) FROM public.account_features
UNION ALL SELECT 'account_industry_access', COUNT(*) FROM public.account_industry_access
UNION ALL SELECT 'projects', COUNT(*) FROM public.projects
UNION ALL SELECT 'standards_library_industries', COUNT(*) FROM public.standards_library_industries
UNION ALL SELECT 'user_industry_access', COUNT(*) FROM public.user_industry_access
ORDER BY table_name;

-- FK/orphan checks (all should be 0)
SELECT 'account_members_missing_account' AS check_name, COUNT(*) AS failures
FROM public.account_members am
LEFT JOIN public.accounts a ON a.id = am.account_id
WHERE a.id IS NULL
UNION ALL
SELECT 'account_members_missing_profile', COUNT(*)
FROM public.account_members am
LEFT JOIN public.profiles p ON p.id = am.user_id
WHERE p.id IS NULL
UNION ALL
SELECT 'account_features_missing_account', COUNT(*)
FROM public.account_features af
LEFT JOIN public.accounts a ON a.id = af.account_id
WHERE a.id IS NULL
UNION ALL
SELECT 'projects_missing_account', COUNT(*)
FROM public.projects p
LEFT JOIN public.accounts a ON a.id = p.account_id
WHERE p.account_id IS NOT NULL AND a.id IS NULL
UNION ALL
SELECT 'user_roles_missing_profile', COUNT(*)
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE p.id IS NULL
UNION ALL
SELECT 'user_permissions_missing_profile', COUNT(*)
FROM public.user_permissions up
LEFT JOIN public.profiles p ON p.id = up.user_id
WHERE p.id IS NULL
UNION ALL
SELECT 'user_industry_access_missing_profile', COUNT(*)
FROM public.user_industry_access uia
LEFT JOIN public.profiles p ON p.id = uia.user_id
WHERE p.id IS NULL
UNION ALL
SELECT 'user_industry_access_missing_industry', COUNT(*)
FROM public.user_industry_access uia
LEFT JOIN public.standards_library_industries i ON i.id = uia.industry_id
WHERE i.id IS NULL
UNION ALL
SELECT 'account_industry_access_missing_account', COUNT(*)
FROM public.account_industry_access aia
LEFT JOIN public.accounts a ON a.id = aia.account_id
WHERE a.id IS NULL
UNION ALL
SELECT 'account_industry_access_missing_industry', COUNT(*)
FROM public.account_industry_access aia
LEFT JOIN public.standards_library_industries i ON i.id = aia.industry_id
WHERE i.id IS NULL;

-- Business invariants
SELECT
  'profiles_without_auth_user' AS check_name,
  COUNT(*) AS failures
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE u.id IS NULL
UNION ALL
SELECT
  'accounts_with_negative_limits',
  COUNT(*)
FROM public.accounts
WHERE COALESCE(max_users, 0) < 0
   OR COALESCE(max_projects, 0) < 0
UNION ALL
SELECT
  'duplicate_account_slug',
  COUNT(*)
FROM (
  SELECT slug
  FROM public.accounts
  GROUP BY slug
  HAVING COUNT(*) > 1
) d
UNION ALL
SELECT
  'duplicate_project_code',
  COUNT(*)
FROM (
  SELECT code
  FROM public.projects
  GROUP BY code
  HAVING COUNT(*) > 1
) d;
