-- Create checklist items table
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('design_conformance', 'construction_specification', 'installation_testing')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_by TEXT,
  completed_date TIMESTAMP WITH TIME ZONE,
  approval_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (approval_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  approved_by TEXT,
  approved_date TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  hazard_id TEXT,
  requirement_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

-- Create policies for checklist items
CREATE POLICY "Anyone can view checklist items"
  ON public.checklist_items
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert checklist items"
  ON public.checklist_items
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update checklist items"
  ON public.checklist_items
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete checklist items"
  ON public.checklist_items
  FOR DELETE
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_checklist_items_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_checklist_items_project_id ON public.checklist_items(project_id);
CREATE INDEX idx_checklist_items_approval_status ON public.checklist_items(approval_status);
CREATE INDEX idx_checklist_items_category ON public.checklist_items(category);