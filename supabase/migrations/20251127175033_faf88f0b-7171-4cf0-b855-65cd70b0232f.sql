-- Add compliance framework to projects table
ALTER TABLE public.projects 
ADD COLUMN compliance_framework text DEFAULT 'FTA' CHECK (compliance_framework IN ('FTA', 'APTA', 'EN_50129', 'EN_50126', 'GENERIC'));

-- Add comment to explain the column
COMMENT ON COLUMN public.projects.compliance_framework IS 'Primary regulatory compliance framework (FTA, APTA, EN 50129, EN 50126, GENERIC)';