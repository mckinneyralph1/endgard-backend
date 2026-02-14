-- Add industry_id column to hazards table for library hazard organization
ALTER TABLE public.hazards 
ADD COLUMN industry_id uuid REFERENCES public.standards_library_industries(id);

-- Create index for efficient querying by industry
CREATE INDEX idx_hazards_industry_id ON public.hazards(industry_id);

-- Add comment explaining the column
COMMENT ON COLUMN public.hazards.industry_id IS 'Industry association for library hazards. NULL for project-specific hazards.';