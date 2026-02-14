-- Add certifiable element reference to hazards table
ALTER TABLE public.hazards
ADD COLUMN ce_id uuid REFERENCES public.certifiable_elements(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_hazards_ce_id ON public.hazards(ce_id);