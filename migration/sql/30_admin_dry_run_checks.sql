-- Run after loading admin dump into migration_admin.* (before merge).
-- These checks detect collisions/mapping issues that would break import.

-- 1) Profiles: duplicate canonical identities (user_id preferred over id)
WITH normalized AS (
  SELECT COALESCE(user_id, id) AS canonical_user_id
  FROM migration_admin.profiles
)
SELECT canonical_user_id, COUNT(*) AS occurrences
FROM normalized
GROUP BY canonical_user_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 2) Accounts: slug conflicts inside admin source
SELECT slug, COUNT(*) AS occurrences
FROM migration_admin.accounts
GROUP BY slug
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 3) Projects: code conflicts inside admin source
SELECT code, COUNT(*) AS occurrences
FROM migration_admin.projects
GROUP BY code
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 4) Potential conflicts against current target unique keys
SELECT 'accounts.slug' AS key_space, a.slug AS key_value
FROM migration_admin.accounts a
JOIN public.accounts p ON p.slug = a.slug AND p.id <> a.id
UNION ALL
SELECT 'projects.code', a.code
FROM migration_admin.projects a
JOIN public.projects p ON p.code = a.code AND p.id <> a.id
UNION ALL
SELECT 'standards_library_industries.code', a.code
FROM migration_admin.standards_library_industries a
JOIN public.standards_library_industries p ON p.code = a.code AND p.id <> a.id;

-- 5) Role/permission value compatibility checks
SELECT DISTINCT ur.role AS invalid_role
FROM migration_admin.user_roles ur
WHERE ur.role::text NOT IN (
  SELECT unnest(enum_range(NULL::public.app_role))::text
);

SELECT DISTINCT up.permission AS invalid_permission
FROM migration_admin.user_permissions up
WHERE up.permission::text NOT IN (
  SELECT unnest(enum_range(NULL::public.app_permission))::text
);

-- 6) FK integrity within admin source staging
SELECT 'account_members->accounts' AS check_name, COUNT(*) AS orphan_count
FROM migration_admin.account_members am
LEFT JOIN migration_admin.accounts a ON a.id = am.account_id
WHERE a.id IS NULL
UNION ALL
SELECT 'account_features->accounts', COUNT(*)
FROM migration_admin.account_features af
LEFT JOIN migration_admin.accounts a ON a.id = af.account_id
WHERE a.id IS NULL
UNION ALL
SELECT 'projects->accounts', COUNT(*)
FROM migration_admin.projects p
LEFT JOIN migration_admin.accounts a ON a.id = p.account_id
WHERE p.account_id IS NOT NULL AND a.id IS NULL;
