-- Create certificate templates table
CREATE TABLE public.certificate_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  header_text text DEFAULT 'Certificate of Compliance',
  body_text text DEFAULT 'This certifies that the project {project_id} has been thoroughly reviewed and meets all applicable safety and compliance requirements.',
  footer_text text,
  signature_layout jsonb DEFAULT '{"columns": 2, "positions": []}'::jsonb,
  styling jsonb DEFAULT '{}'::jsonb,
  is_default boolean DEFAULT false,
  created_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for certificate templates
CREATE POLICY "Anyone can view certificate templates" 
ON public.certificate_templates 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Only managers can insert certificate templates" 
ON public.certificate_templates 
FOR INSERT 
TO authenticated
WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Only managers can update certificate templates" 
ON public.certificate_templates 
FOR UPDATE 
TO authenticated
USING (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Only managers can delete certificate templates" 
ON public.certificate_templates 
FOR DELETE 
TO authenticated
USING (public.current_user_has_role('manager'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_certificate_templates_updated_at
BEFORE UPDATE ON public.certificate_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add template_id to certificates table
ALTER TABLE public.certificates 
ADD COLUMN template_id uuid REFERENCES public.certificate_templates(id) ON DELETE SET NULL;

-- Create a default template
INSERT INTO public.certificate_templates (name, description, created_by, is_default)
VALUES (
  'Standard Compliance Certificate',
  'Default certificate template for compliance documentation',
  'System',
  true
);