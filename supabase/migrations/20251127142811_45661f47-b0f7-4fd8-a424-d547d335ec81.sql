-- Create risk_matrices table for configurable risk assessment matrices
CREATE TABLE IF NOT EXISTS public.risk_matrices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_id TEXT REFERENCES public.projects(id),
  is_default BOOLEAN DEFAULT false,
  severity_levels JSONB NOT NULL DEFAULT '[
    {"value": "catastrophic", "label": "Catastrophic", "order": 1},
    {"value": "critical", "label": "Critical", "order": 2},
    {"value": "moderate", "label": "Moderate", "order": 3},
    {"value": "minor", "label": "Minor", "order": 4},
    {"value": "negligible", "label": "Negligible", "order": 5}
  ]'::jsonb,
  likelihood_levels JSONB NOT NULL DEFAULT '[
    {"value": "almost_certain", "label": "Almost Certain", "order": 1},
    {"value": "likely", "label": "Likely", "order": 2},
    {"value": "possible", "label": "Possible", "order": 3},
    {"value": "unlikely", "label": "Unlikely", "order": 4},
    {"value": "rare", "label": "Rare", "order": 5}
  ]'::jsonb,
  risk_calculation_rules JSONB NOT NULL DEFAULT '{
    "critical": [[1,1], [1,2], [2,1]],
    "high": [[1,3], [2,2], [3,1], [1,4], [2,3], [3,2], [4,1]],
    "medium": [[2,4], [3,3], [4,2], [5,1], [1,5], [2,5], [3,4], [4,3], [5,2]],
    "low": [[3,5], [4,4], [5,3], [4,5], [5,4], [5,5]]
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.risk_matrices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view risk matrices"
  ON public.risk_matrices FOR SELECT
  USING (true);

CREATE POLICY "Managers can insert risk matrices"
  ON public.risk_matrices FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update risk matrices"
  ON public.risk_matrices FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete risk matrices"
  ON public.risk_matrices FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Create index for performance
CREATE INDEX idx_risk_matrices_project_id ON public.risk_matrices(project_id);
CREATE INDEX idx_risk_matrices_is_default ON public.risk_matrices(is_default) WHERE is_default = true;

-- Create trigger for updated_at
CREATE TRIGGER update_risk_matrices_updated_at
  BEFORE UPDATE ON public.risk_matrices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default organization-wide matrix
INSERT INTO public.risk_matrices (name, description, is_default, project_id)
VALUES (
  'Standard 5x5 Risk Matrix',
  'Default organization-wide risk assessment matrix following industry best practices',
  true,
  NULL
);