-- Create hazard templates table
CREATE TABLE public.hazard_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  industry_id UUID REFERENCES public.standards_library_industries(id),
  system_type TEXT,
  framework TEXT,
  is_default BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create hazard template items table
CREATE TABLE public.hazard_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.hazard_templates(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'Medium',
  likelihood TEXT NOT NULL DEFAULT 'Possible',
  risk_level TEXT NOT NULL DEFAULT 'Medium',
  analysis_type TEXT NOT NULL DEFAULT 'General',
  mitigation TEXT,
  sil TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create requirement templates table
CREATE TABLE public.requirement_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  industry_id UUID REFERENCES public.standards_library_industries(id),
  standard_id UUID REFERENCES public.standards_library_standards(id),
  framework TEXT,
  is_default BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create requirement template items table
CREATE TABLE public.requirement_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.requirement_templates(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  standard TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  verification_method TEXT,
  sil TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.hazard_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_template_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for hazard_templates
CREATE POLICY "Anyone can view hazard templates" ON public.hazard_templates
  FOR SELECT USING (true);

CREATE POLICY "Managers can insert hazard templates" ON public.hazard_templates
  FOR INSERT WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update hazard templates" ON public.hazard_templates
  FOR UPDATE USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete hazard templates" ON public.hazard_templates
  FOR DELETE USING (current_user_has_role('manager'::app_role));

-- RLS policies for hazard_template_items
CREATE POLICY "Anyone can view hazard template items" ON public.hazard_template_items
  FOR SELECT USING (true);

CREATE POLICY "Managers can insert hazard template items" ON public.hazard_template_items
  FOR INSERT WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update hazard template items" ON public.hazard_template_items
  FOR UPDATE USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete hazard template items" ON public.hazard_template_items
  FOR DELETE USING (current_user_has_role('manager'::app_role));

-- RLS policies for requirement_templates
CREATE POLICY "Anyone can view requirement templates" ON public.requirement_templates
  FOR SELECT USING (true);

CREATE POLICY "Managers can insert requirement templates" ON public.requirement_templates
  FOR INSERT WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update requirement templates" ON public.requirement_templates
  FOR UPDATE USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete requirement templates" ON public.requirement_templates
  FOR DELETE USING (current_user_has_role('manager'::app_role));

-- RLS policies for requirement_template_items
CREATE POLICY "Anyone can view requirement template items" ON public.requirement_template_items
  FOR SELECT USING (true);

CREATE POLICY "Managers can insert requirement template items" ON public.requirement_template_items
  FOR INSERT WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update requirement template items" ON public.requirement_template_items
  FOR UPDATE USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete requirement template items" ON public.requirement_template_items
  FOR DELETE USING (current_user_has_role('manager'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_hazard_templates_updated_at
  BEFORE UPDATE ON public.hazard_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_requirement_templates_updated_at
  BEFORE UPDATE ON public.requirement_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();