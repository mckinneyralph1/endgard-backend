-- Run on each source database and on target (pre/post) to capture inventory baselines.

WITH public_tables AS (
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
)
SELECT
  'table_count' AS metric,
  COUNT(*)::text AS value
FROM public_tables
UNION ALL
SELECT
  'function_count' AS metric,
  COUNT(*)::text AS value
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
UNION ALL
SELECT
  'trigger_count' AS metric,
  COUNT(*)::text AS value
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY metric;

-- Core table row counts used for migration validation.
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
