-- Add category field to checklist_approvals table
ALTER TABLE public.checklist_approvals 
ADD COLUMN category text;

-- Create unique constraint to ensure one approval per project per category
CREATE UNIQUE INDEX checklist_approvals_project_category_idx 
ON public.checklist_approvals(project_id, category) 
WHERE category IS NOT NULL;