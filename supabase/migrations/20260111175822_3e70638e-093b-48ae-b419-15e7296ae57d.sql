-- Create flagged_items table for manual attention flagging
CREATE TABLE public.flagged_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'hazard', 'requirement', 'test_case', 'checklist_item', 'certifiable_element', etc.
  entity_id UUID NOT NULL,
  entity_uid TEXT, -- Store the UID for display
  entity_title TEXT, -- Store the title for display
  reason TEXT,
  flagged_by UUID REFERENCES auth.users(id),
  flagged_by_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  UNIQUE(project_id, entity_type, entity_id)
);

-- Enable RLS
ALTER TABLE public.flagged_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view flagged items for their projects"
ON public.flagged_items
FOR SELECT
USING (true);

CREATE POLICY "Users can flag items"
ON public.flagged_items
FOR INSERT
WITH CHECK (auth.uid() = flagged_by);

CREATE POLICY "Users can update flagged items"
ON public.flagged_items
FOR UPDATE
USING (true);

CREATE POLICY "Users can delete flagged items"
ON public.flagged_items
FOR DELETE
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_flagged_items_project ON public.flagged_items(project_id);
CREATE INDEX idx_flagged_items_entity ON public.flagged_items(entity_type, entity_id);