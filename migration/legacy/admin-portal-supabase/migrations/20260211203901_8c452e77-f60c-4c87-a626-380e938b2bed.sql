
-- 1. Update app_role enum to match platform (remove moderator/user, add manager/auditor)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

-- 2. Add missing columns to accounts table
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- 3. Add missing columns to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS standard text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS industry_id uuid;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS compliance_framework text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_date date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by uuid;

-- 4. Add missing columns to profiles table  
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- 5. Update account_members.role from text to match platform's enum
-- First create the enum
DO $$ BEGIN
  CREATE TYPE public.account_member_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Create app_permission enum to match platform
DO $$ BEGIN
  CREATE TYPE public.app_permission AS ENUM ('admin', 'approver');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Add foreign key for projects.industry_id if not exists
DO $$ BEGIN
  ALTER TABLE public.projects 
    ADD CONSTRAINT projects_industry_id_fkey 
    FOREIGN KEY (industry_id) REFERENCES public.standards_library_industries(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Add code column to standards_library_industries if missing (platform has it)
ALTER TABLE public.standards_library_industries ADD COLUMN IF NOT EXISTS icon text;
