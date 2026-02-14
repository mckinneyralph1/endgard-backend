-- Add industry_id and framework columns to ce_templates
ALTER TABLE public.ce_templates 
ADD COLUMN industry_id uuid REFERENCES public.standards_library_industries(id) ON DELETE SET NULL,
ADD COLUMN framework text;

-- Create index for efficient filtering
CREATE INDEX idx_ce_templates_industry_id ON public.ce_templates(industry_id);
CREATE INDEX idx_ce_templates_framework ON public.ce_templates(framework);

-- Add comment for documentation
COMMENT ON COLUMN public.ce_templates.industry_id IS 'Reference to standards library industry for template organization';
COMMENT ON COLUMN public.ce_templates.framework IS 'Compliance framework (FTA, APTA, EN_50129, EN_50126, GENERIC)';