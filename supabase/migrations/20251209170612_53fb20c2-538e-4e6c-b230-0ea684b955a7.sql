-- Create test_procedures table for detailed execution steps
CREATE TABLE public.test_procedures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_case_id UUID NOT NULL REFERENCES public.test_cases(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  instruction TEXT NOT NULL,
  expected_result TEXT,
  equipment_required TEXT,
  prerequisites TEXT,
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by TEXT,
  approved_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for faster lookups by test_case_id
CREATE INDEX idx_test_procedures_test_case_id ON public.test_procedures(test_case_id);

-- Add index for step ordering
CREATE INDEX idx_test_procedures_step_order ON public.test_procedures(test_case_id, step_number);

-- Enable RLS
ALTER TABLE public.test_procedures ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view test procedures"
  ON public.test_procedures
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert test procedures"
  ON public.test_procedures
  FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update test procedures"
  ON public.test_procedures
  FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete test procedures"
  ON public.test_procedures
  FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_test_procedures_updated_at
  BEFORE UPDATE ON public.test_procedures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.test_procedures IS 'Step-by-step test execution procedures linked to test cases with approval workflow';