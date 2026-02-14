-- Create table for configurable checklist categories
CREATE TABLE public.checklist_category_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  framework text NOT NULL,
  category_key text NOT NULL,
  display_name text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE(framework, category_key)
);

-- Create table for configurable checklist phases  
CREATE TABLE public.checklist_phase_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  framework text NOT NULL,
  phase_key text NOT NULL,
  display_name text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  tab_mapping text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE(framework, phase_key)
);

-- Enable RLS
ALTER TABLE public.checklist_category_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_phase_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for category config
CREATE POLICY "Anyone can view category config" ON public.checklist_category_config
  FOR SELECT USING (true);

CREATE POLICY "Managers can insert category config" ON public.checklist_category_config
  FOR INSERT WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update category config" ON public.checklist_category_config
  FOR UPDATE USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete category config" ON public.checklist_category_config
  FOR DELETE USING (current_user_has_role('manager'::app_role));

-- RLS policies for phase config
CREATE POLICY "Anyone can view phase config" ON public.checklist_phase_config
  FOR SELECT USING (true);

CREATE POLICY "Managers can insert phase config" ON public.checklist_phase_config
  FOR INSERT WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update phase config" ON public.checklist_phase_config
  FOR UPDATE USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete phase config" ON public.checklist_phase_config
  FOR DELETE USING (current_user_has_role('manager'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_checklist_category_config_updated_at
  BEFORE UPDATE ON public.checklist_category_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_checklist_phase_config_updated_at
  BEFORE UPDATE ON public.checklist_phase_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();