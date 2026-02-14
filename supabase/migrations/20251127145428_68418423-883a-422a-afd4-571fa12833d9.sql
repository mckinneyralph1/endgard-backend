-- Create compliance_validations table to track AI-powered compliance checks
CREATE TABLE IF NOT EXISTS public.compliance_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_case_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  standard TEXT NOT NULL,
  validation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  compliance_score NUMERIC NOT NULL CHECK (compliance_score >= 0 AND compliance_score <= 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'requires_review')),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  validated_by TEXT,
  ai_model TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compliance_validations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view compliance validations"
  ON public.compliance_validations
  FOR SELECT
  USING (true);

CREATE POLICY "Managers can insert compliance validations"
  ON public.compliance_validations
  FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update compliance validations"
  ON public.compliance_validations
  FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Only managers can delete compliance validations"
  ON public.compliance_validations
  FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_compliance_validations_updated_at
  BEFORE UPDATE ON public.compliance_validations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_compliance_validations_test_case_id ON public.compliance_validations(test_case_id);
CREATE INDEX idx_compliance_validations_project_id ON public.compliance_validations(project_id);
CREATE INDEX idx_compliance_validations_status ON public.compliance_validations(status);