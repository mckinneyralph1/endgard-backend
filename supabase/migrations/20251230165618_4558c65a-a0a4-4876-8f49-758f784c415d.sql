-- Add planning fields to project_milestones for Gantt chart
ALTER TABLE public.project_milestones 
ADD COLUMN IF NOT EXISTS planned_start DATE,
ADD COLUMN IF NOT EXISTS planned_end DATE,
ADD COLUMN IF NOT EXISTS actual_start DATE,
ADD COLUMN IF NOT EXISTS actual_end DATE,
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS milestone_type TEXT DEFAULT 'task';

-- Create phase_dependencies table for Gantt dependencies
CREATE TABLE public.phase_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  predecessor_id UUID NOT NULL REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish-to-start',
  lag_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(predecessor_id, successor_id)
);

-- Add indexes
CREATE INDEX idx_phase_dependencies_project_id ON public.phase_dependencies(project_id);
CREATE INDEX idx_phase_dependencies_predecessor ON public.phase_dependencies(predecessor_id);
CREATE INDEX idx_phase_dependencies_successor ON public.phase_dependencies(successor_id);

-- Enable RLS
ALTER TABLE public.phase_dependencies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view phase dependencies" 
ON public.phase_dependencies 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create phase dependencies" 
ON public.phase_dependencies 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update phase dependencies" 
ON public.phase_dependencies 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete phase dependencies" 
ON public.phase_dependencies 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.phase_dependencies;