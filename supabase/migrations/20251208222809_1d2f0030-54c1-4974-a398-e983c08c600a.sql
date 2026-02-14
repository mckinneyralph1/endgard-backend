-- Add is_archived column to projects table
ALTER TABLE public.projects 
ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Add index for filtering archived projects
CREATE INDEX idx_projects_is_archived ON public.projects(is_archived);

-- Update RLS policy for viewing projects (no change needed, existing policy works)