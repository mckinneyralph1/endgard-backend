-- Add hazard_id to requirements table for multi-requirement linkage
-- This enables many requirements to link to a single hazard (Hazard 1 → N Requirements)

ALTER TABLE public.requirements
ADD COLUMN hazard_id UUID REFERENCES public.hazards(id) ON DELETE SET NULL;

-- Create index for efficient queries
CREATE INDEX idx_requirements_hazard_id ON public.requirements(hazard_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN public.requirements.hazard_id IS 'Links requirement to source hazard for traceability. Multiple requirements can derive from a single hazard.';

-- Note: The existing hazards.requirement_id column is kept for backward compatibility
-- but hazard_id on requirements is the preferred many-to-one relationship going forward