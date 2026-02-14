-- Create certificates table
CREATE TABLE public.certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  certificate_number text NOT NULL UNIQUE,
  issue_date timestamp with time zone NOT NULL DEFAULT now(),
  expiry_date timestamp with time zone,
  status text NOT NULL DEFAULT 'draft',
  compliance_standards jsonb,
  created_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create signatures table
CREATE TABLE public.certificate_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_id uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_role text NOT NULL,
  signature_data text,
  signed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_signatures ENABLE ROW LEVEL SECURITY;

-- RLS policies for certificates
CREATE POLICY "Authenticated users can view certificates" 
ON public.certificates 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert certificates" 
ON public.certificates 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update certificates" 
ON public.certificates 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Only managers can delete certificates" 
ON public.certificates 
FOR DELETE 
TO authenticated
USING (public.current_user_has_role('manager'::app_role));

-- RLS policies for signatures
CREATE POLICY "Authenticated users can view signatures" 
ON public.certificate_signatures 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can add signatures" 
ON public.certificate_signatures 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Only managers can delete signatures" 
ON public.certificate_signatures 
FOR DELETE 
TO authenticated
USING (public.current_user_has_role('manager'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_certificates_updated_at
BEFORE UPDATE ON public.certificates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();