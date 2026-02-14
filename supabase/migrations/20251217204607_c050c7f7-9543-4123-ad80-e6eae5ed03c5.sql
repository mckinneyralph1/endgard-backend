-- Add external ID tracking for sync with DOORS/Jama/Polarion
ALTER TABLE public.requirements 
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_tool TEXT,
ADD COLUMN IF NOT EXISTS external_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS external_checksum TEXT;

ALTER TABLE public.hazards 
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_tool TEXT,
ADD COLUMN IF NOT EXISTS external_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS external_checksum TEXT;

ALTER TABLE public.test_cases 
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_tool TEXT,
ADD COLUMN IF NOT EXISTS external_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS external_checksum TEXT;

-- Create indexes for efficient sync lookups
CREATE INDEX IF NOT EXISTS idx_requirements_external_id ON public.requirements(external_id, external_tool);
CREATE INDEX IF NOT EXISTS idx_hazards_external_id ON public.hazards(external_id, external_tool);
CREATE INDEX IF NOT EXISTS idx_test_cases_external_id ON public.test_cases(external_id, external_tool);