
-- Create design_records table for capturing design decisions that meet requirements
CREATE TABLE public.design_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  design_approach TEXT,
  mitigation_strategy TEXT,
  verification_method TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  requirement_id UUID REFERENCES public.requirements(id) ON DELETE SET NULL,
  hazard_id UUID REFERENCES public.hazards(id) ON DELETE SET NULL,
  ce_id UUID REFERENCES public.certifiable_elements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create specifications table for construction/installation specs from design
CREATE TABLE public.specifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  spec_type TEXT NOT NULL DEFAULT 'construction', -- construction, installation, integration
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  design_id UUID REFERENCES public.design_records(id) ON DELETE SET NULL,
  requirement_id UUID REFERENCES public.requirements(id) ON DELETE SET NULL,
  ce_id UUID REFERENCES public.certifiable_elements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add design_id to test_cases for complete traceability
ALTER TABLE public.test_cases 
ADD COLUMN design_id UUID REFERENCES public.design_records(id) ON DELETE SET NULL,
ADD COLUMN specification_id UUID REFERENCES public.specifications(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.design_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for design_records
CREATE POLICY "Authenticated users can view design records"
  ON public.design_records FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert design records"
  ON public.design_records FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update design records"
  ON public.design_records FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete design records"
  ON public.design_records FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- RLS policies for specifications
CREATE POLICY "Authenticated users can view specifications"
  ON public.specifications FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert specifications"
  ON public.specifications FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update specifications"
  ON public.specifications FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete specifications"
  ON public.specifications FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Create indexes for performance
CREATE INDEX idx_design_records_project ON public.design_records(project_id);
CREATE INDEX idx_design_records_requirement ON public.design_records(requirement_id);
CREATE INDEX idx_design_records_hazard ON public.design_records(hazard_id);
CREATE INDEX idx_specifications_project ON public.specifications(project_id);
CREATE INDEX idx_specifications_design ON public.specifications(design_id);
CREATE INDEX idx_test_cases_design ON public.test_cases(design_id);
CREATE INDEX idx_test_cases_specification ON public.test_cases(specification_id);

-- Triggers for updated_at
CREATE TRIGGER update_design_records_updated_at
  BEFORE UPDATE ON public.design_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_specifications_updated_at
  BEFORE UPDATE ON public.specifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
