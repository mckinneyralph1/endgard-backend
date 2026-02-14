-- Add name column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_name ON public.profiles(name);