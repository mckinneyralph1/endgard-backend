-- Create junction table for linking library hazards to projects
CREATE TABLE public.project_hazard_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  hazard_id UUID NOT NULL REFERENCES public.hazards(id) ON DELETE CASCADE,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  linked_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(project_id, hazard_id)
);

-- Enable RLS
ALTER TABLE public.project_hazard_links ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view project hazard links"
ON public.project_hazard_links
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert project hazard links"
ON public.project_hazard_links
FOR INSERT
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete project hazard links"
ON public.project_hazard_links
FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- Add index for performance
CREATE INDEX idx_project_hazard_links_project ON public.project_hazard_links(project_id);
CREATE INDEX idx_project_hazard_links_hazard ON public.project_hazard_links(hazard_id);