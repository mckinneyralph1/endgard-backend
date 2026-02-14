-- Create verification_records table for comprehensive verification tracking
CREATE TABLE public.verification_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Polymorphic reference to the item being verified
  item_type TEXT NOT NULL, -- 'requirement', 'hazard', 'test_case', 'checklist_item'
  item_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  
  -- Verification details
  verification_method TEXT, -- 'analysis', 'inspection', 'test', 'demonstration', 'review'
  verification_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'verified', 'failed', 'not_applicable'
  verification_date TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,
  
  -- Verifier information
  verifier_id UUID REFERENCES public.profiles(id),
  verifier_name TEXT,
  verifier_role TEXT, -- 'engineer', 'qa_inspector', 'safety_manager', 'independent_assessor', etc.
  verifier_organization TEXT,
  verifier_credentials TEXT, -- certifications, qualifications
  
  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Create verification_documents table for evidence attachments
CREATE TABLE public.verification_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verification_record_id UUID NOT NULL REFERENCES public.verification_records(id) ON DELETE CASCADE,
  
  -- Document details
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  description TEXT,
  document_type TEXT, -- 'test_report', 'inspection_record', 'photo', 'certificate', 'calculation', 'drawing', 'other'
  
  -- Upload tracking
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

-- Verification records policies
CREATE POLICY "Authenticated users can view verification records"
ON public.verification_records FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create verification records"
ON public.verification_records FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update verification records"
ON public.verification_records FOR UPDATE
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete verification records"
ON public.verification_records FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- Verification documents policies
CREATE POLICY "Authenticated users can view verification documents"
ON public.verification_documents FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload verification documents"
ON public.verification_documents FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete verification documents"
ON public.verification_documents FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- Create storage bucket for verification documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('verification-documents', 'verification-documents', false);

-- Storage policies for verification documents
CREATE POLICY "Authenticated users can view verification documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'verification-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload verification documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'verification-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete verification documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'verification-documents' AND current_user_has_role('manager'::app_role));

-- Add indexes for performance
CREATE INDEX idx_verification_records_item ON public.verification_records(item_type, item_id);
CREATE INDEX idx_verification_records_project ON public.verification_records(project_id);
CREATE INDEX idx_verification_records_verifier ON public.verification_records(verifier_id);
CREATE INDEX idx_verification_documents_record ON public.verification_documents(verification_record_id);

-- Add trigger for updated_at
CREATE TRIGGER update_verification_records_updated_at
  BEFORE UPDATE ON public.verification_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();