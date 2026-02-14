-- Create CE templates table
CREATE TABLE public.ce_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_default BOOLEAN DEFAULT false
);

-- Create CE template items table (stores the actual CE definitions)
CREATE TABLE public.ce_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.ce_templates(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  sil_target TEXT,
  parent_uid TEXT, -- Reference to another item's UID in same template for hierarchy
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_ce_template_items_template_id ON public.ce_template_items(template_id);
CREATE INDEX idx_ce_template_items_parent_uid ON public.ce_template_items(parent_uid);

-- Enable Row Level Security
ALTER TABLE public.ce_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_template_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ce_templates
CREATE POLICY "Anyone can view CE templates" 
ON public.ce_templates 
FOR SELECT 
USING (true);

CREATE POLICY "Managers can insert CE templates" 
ON public.ce_templates 
FOR INSERT 
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update CE templates" 
ON public.ce_templates 
FOR UPDATE 
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Only managers can delete CE templates" 
ON public.ce_templates 
FOR DELETE 
USING (current_user_has_role('manager'::app_role));

-- RLS Policies for ce_template_items
CREATE POLICY "Anyone can view CE template items" 
ON public.ce_template_items 
FOR SELECT 
USING (true);

CREATE POLICY "Managers can insert CE template items" 
ON public.ce_template_items 
FOR INSERT 
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update CE template items" 
ON public.ce_template_items 
FOR UPDATE 
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Only managers can delete CE template items" 
ON public.ce_template_items 
FOR DELETE 
USING (current_user_has_role('manager'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_ce_templates_updated_at
  BEFORE UPDATE ON public.ce_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();