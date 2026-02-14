-- Create project_blockers table for tracking blockers/challenges
CREATE TABLE public.project_blockers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT, -- NULL for project-level, phase name for phase-specific
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  owner_id UUID REFERENCES public.profiles(id),
  due_date DATE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.profiles(id),
  resolution_notes TEXT,
  -- Linked items
  linked_hazard_id UUID REFERENCES public.hazards(id) ON DELETE SET NULL,
  linked_requirement_id UUID REFERENCES public.requirements(id) ON DELETE SET NULL,
  linked_test_case_id UUID REFERENCES public.test_cases(id) ON DELETE SET NULL,
  linked_ce_id UUID REFERENCES public.certifiable_elements(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Create blocker_history table for resolution history
CREATE TABLE public.blocker_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES public.project_blockers(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'status_change', 'updated', 'resolved', 'reopened'
  old_value TEXT,
  new_value TEXT,
  notes TEXT,
  user_id UUID REFERENCES public.profiles(id),
  user_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create project_status table for project-level status
CREATE TABLE public.project_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  overall_status TEXT NOT NULL DEFAULT 'on_track' CHECK (overall_status IN ('on_track', 'at_risk', 'blocked', 'completed')),
  status_notes TEXT,
  last_status_update TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocker_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_status ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_blockers
CREATE POLICY "Authenticated users can view blockers" 
ON public.project_blockers FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert blockers" 
ON public.project_blockers FOR INSERT 
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update blockers" 
ON public.project_blockers FOR UPDATE 
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete blockers" 
ON public.project_blockers FOR DELETE 
USING (current_user_has_role('manager'::app_role));

-- RLS policies for blocker_history
CREATE POLICY "Authenticated users can view blocker history" 
ON public.blocker_history FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert blocker history" 
ON public.blocker_history FOR INSERT 
WITH CHECK (true);

-- RLS policies for project_status
CREATE POLICY "Authenticated users can view project status" 
ON public.project_status FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert project status" 
ON public.project_status FOR INSERT 
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update project status" 
ON public.project_status FOR UPDATE 
USING (current_user_has_role('manager'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_project_blockers_updated_at
BEFORE UPDATE ON public.project_blockers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_status_updated_at
BEFORE UPDATE ON public.project_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes
CREATE INDEX idx_project_blockers_project_id ON public.project_blockers(project_id);
CREATE INDEX idx_project_blockers_status ON public.project_blockers(status);
CREATE INDEX idx_project_blockers_phase_id ON public.project_blockers(phase_id);
CREATE INDEX idx_blocker_history_blocker_id ON public.blocker_history(blocker_id);