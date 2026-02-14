-- Create storage bucket for checklist documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('checklist-documents', 'checklist-documents', false);

-- Create table to track checklist item documents
CREATE TABLE public.checklist_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on checklist_documents table
ALTER TABLE public.checklist_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for checklist_documents
CREATE POLICY "Anyone can view checklist documents"
  ON public.checklist_documents
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert checklist documents"
  ON public.checklist_documents
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete checklist documents"
  ON public.checklist_documents
  FOR DELETE
  USING (true);

-- Storage policies for checklist-documents bucket
CREATE POLICY "Users can view checklist documents"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'checklist-documents');

CREATE POLICY "Users can upload checklist documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'checklist-documents');

CREATE POLICY "Users can update their checklist documents"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'checklist-documents');

CREATE POLICY "Users can delete checklist documents"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'checklist-documents');

-- Add trigger for updated_at
CREATE TRIGGER update_checklist_documents_updated_at
  BEFORE UPDATE ON public.checklist_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_checklist_documents_item_id ON public.checklist_documents(checklist_item_id);