-- Create hazard_documents table for storing documents linked to hazards
CREATE TABLE public.hazard_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hazard_id UUID NOT NULL REFERENCES public.hazards(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hazard_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view hazard documents"
ON public.hazard_documents FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert hazard documents"
ON public.hazard_documents FOR INSERT
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete hazard documents"
ON public.hazard_documents FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- Create storage bucket for hazard documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('hazard-documents', 'hazard-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for hazard documents bucket
CREATE POLICY "Authenticated users can view hazard documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'hazard-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can upload hazard documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'hazard-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete hazard documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'hazard-documents' AND auth.uid() IS NOT NULL);