-- Create table for referencing existing documents with specific locations
CREATE TABLE public.verification_document_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verification_record_id UUID NOT NULL REFERENCES public.verification_records(id) ON DELETE CASCADE,
  
  -- Reference to source document (can be standards library doc or other verification doc)
  source_type TEXT NOT NULL, -- 'standards_library', 'verification_document', 'external_url'
  source_document_id UUID, -- references standards_library_documents or verification_documents
  external_url TEXT, -- for external references
  
  -- Location within document
  page_number TEXT, -- can be range like "15-17"
  section_reference TEXT, -- e.g., "Section 4.2.3"
  paragraph_reference TEXT, -- e.g., "Paragraph 2"
  table_reference TEXT, -- e.g., "Table 5"
  figure_reference TEXT, -- e.g., "Figure 3.1"
  
  -- Description
  description TEXT,
  quote_excerpt TEXT, -- optional excerpt from the document
  
  -- Tracking
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_document_references ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view document references"
ON public.verification_document_references FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create document references"
ON public.verification_document_references FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete document references"
ON public.verification_document_references FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- Add index
CREATE INDEX idx_verification_doc_refs_record ON public.verification_document_references(verification_record_id);
CREATE INDEX idx_verification_doc_refs_source ON public.verification_document_references(source_document_id);