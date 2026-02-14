-- Add super_admin to app_role enum (must be committed before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';