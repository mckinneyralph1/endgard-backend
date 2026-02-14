-- Creates a staging schema for admin-source imports and mirrors core table shapes.

CREATE SCHEMA IF NOT EXISTS migration_admin;

CREATE TABLE IF NOT EXISTS migration_admin.profiles (LIKE public.profiles INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.user_roles (LIKE public.user_roles INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.user_permissions (LIKE public.user_permissions INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.accounts (LIKE public.accounts INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.account_members (LIKE public.account_members INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.account_features (LIKE public.account_features INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.account_industry_access (LIKE public.account_industry_access INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.projects (LIKE public.projects INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.standards_library_industries (LIKE public.standards_library_industries INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.user_industry_access (LIKE public.user_industry_access INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);
CREATE TABLE IF NOT EXISTS migration_admin.feature_definitions (LIKE public.feature_definitions INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED);

TRUNCATE TABLE migration_admin.profiles;
TRUNCATE TABLE migration_admin.user_roles;
TRUNCATE TABLE migration_admin.user_permissions;
TRUNCATE TABLE migration_admin.accounts;
TRUNCATE TABLE migration_admin.account_members;
TRUNCATE TABLE migration_admin.account_features;
TRUNCATE TABLE migration_admin.account_industry_access;
TRUNCATE TABLE migration_admin.projects;
TRUNCATE TABLE migration_admin.standards_library_industries;
TRUNCATE TABLE migration_admin.user_industry_access;
TRUNCATE TABLE migration_admin.feature_definitions;
