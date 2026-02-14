-- Create requirements table for standards compliance
CREATE TABLE public.requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  standard TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  verification_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, uid)
);

-- Create certifiable_elements table for CE/SCE management
CREATE TABLE public.certifiable_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  sil_target TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, uid)
);

-- Create test_cases table for V&V
CREATE TABLE public.test_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  test_type TEXT NOT NULL,
  requirement_id UUID REFERENCES public.requirements(id),
  hazard_id UUID REFERENCES public.hazards(id),
  ce_id UUID REFERENCES public.certifiable_elements(id),
  status TEXT NOT NULL DEFAULT 'not_executed',
  result TEXT,
  executed_date TIMESTAMP WITH TIME ZONE,
  executed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, uid)
);

-- Add SIL field to hazards table
ALTER TABLE public.hazards
ADD COLUMN sil TEXT;

-- Add requirement_id to hazards for traceability
ALTER TABLE public.hazards
ADD COLUMN requirement_id UUID REFERENCES public.requirements(id);

-- Enable RLS on new tables
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifiable_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for requirements
CREATE POLICY "Anyone can view requirements"
ON public.requirements FOR SELECT USING (true);

CREATE POLICY "Anyone can insert requirements"
ON public.requirements FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update requirements"
ON public.requirements FOR UPDATE USING (true);

CREATE POLICY "Only managers can delete requirements"
ON public.requirements FOR DELETE USING (current_user_has_role('manager'::app_role));

-- Create RLS policies for certifiable_elements
CREATE POLICY "Anyone can view certifiable elements"
ON public.certifiable_elements FOR SELECT USING (true);

CREATE POLICY "Anyone can insert certifiable elements"
ON public.certifiable_elements FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update certifiable elements"
ON public.certifiable_elements FOR UPDATE USING (true);

CREATE POLICY "Only managers can delete certifiable elements"
ON public.certifiable_elements FOR DELETE USING (current_user_has_role('manager'::app_role));

-- Create RLS policies for test_cases
CREATE POLICY "Anyone can view test cases"
ON public.test_cases FOR SELECT USING (true);

CREATE POLICY "Anyone can insert test cases"
ON public.test_cases FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update test cases"
ON public.test_cases FOR UPDATE USING (true);

CREATE POLICY "Only managers can delete test cases"
ON public.test_cases FOR DELETE USING (current_user_has_role('manager'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_requirements_updated_at
BEFORE UPDATE ON public.requirements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_certifiable_elements_updated_at
BEFORE UPDATE ON public.certifiable_elements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_test_cases_updated_at
BEFORE UPDATE ON public.test_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();