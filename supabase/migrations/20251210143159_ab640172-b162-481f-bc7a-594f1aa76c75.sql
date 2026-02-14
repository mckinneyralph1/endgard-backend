-- Add source document reference columns to hazards table
ALTER TABLE public.hazards
ADD COLUMN source_document_id uuid REFERENCES public.standards_library_documents(id),
ADD COLUMN source_external_url text,
ADD COLUMN source_page text,
ADD COLUMN source_section text,
ADD COLUMN source_quote text;

-- Add source document reference columns to requirements table
ALTER TABLE public.requirements
ADD COLUMN source_document_id uuid REFERENCES public.standards_library_documents(id),
ADD COLUMN source_external_url text,
ADD COLUMN source_page text,
ADD COLUMN source_section text,
ADD COLUMN source_quote text;

-- Add source document reference columns to test_cases table
ALTER TABLE public.test_cases
ADD COLUMN source_document_id uuid REFERENCES public.standards_library_documents(id),
ADD COLUMN source_external_url text,
ADD COLUMN source_page text,
ADD COLUMN source_section text,
ADD COLUMN source_quote text;

-- Add source document reference columns to checklist_items table
ALTER TABLE public.checklist_items
ADD COLUMN source_document_id uuid REFERENCES public.standards_library_documents(id),
ADD COLUMN source_external_url text,
ADD COLUMN source_page text,
ADD COLUMN source_section text,
ADD COLUMN source_quote text;

-- Create indexes for efficient querying by source document
CREATE INDEX idx_hazards_source_document ON public.hazards(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX idx_requirements_source_document ON public.requirements(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX idx_test_cases_source_document ON public.test_cases(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX idx_checklist_items_source_document ON public.checklist_items(source_document_id) WHERE source_document_id IS NOT NULL;