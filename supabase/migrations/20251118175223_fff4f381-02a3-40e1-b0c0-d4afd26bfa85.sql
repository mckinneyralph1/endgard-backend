-- Add analysis_type field to hazards table to support different methodologies
ALTER TABLE public.hazards 
ADD COLUMN analysis_type text NOT NULL DEFAULT 'General';

-- Add a comment explaining the field
COMMENT ON COLUMN public.hazards.analysis_type IS 'Type of hazard analysis methodology: SHA, SSHA, FMECA, O&SHA, PHA, etc.';