-- Add phase field to checklist_items to link them to framework phases
ALTER TABLE public.checklist_items 
ADD COLUMN IF NOT EXISTS phase_id TEXT;

-- Add index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_checklist_items_phase_project 
ON public.checklist_items(project_id, phase_id, completed);

-- Add comment for documentation
COMMENT ON COLUMN public.checklist_items.phase_id IS 'Links checklist item to a specific phase in the compliance framework (e.g., identify_ces, design_criteria)';