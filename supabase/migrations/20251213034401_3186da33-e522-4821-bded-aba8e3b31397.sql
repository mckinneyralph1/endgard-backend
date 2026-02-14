-- Create enum for notification types
CREATE TYPE public.notification_type AS ENUM (
  'deadline_reminder',
  'milestone_approaching', 
  'phase_ready',
  'action_required',
  'escalation',
  'weekly_summary'
);

-- Create enum for notification status
CREATE TYPE public.notification_status AS ENUM (
  'pending',
  'sent',
  'read',
  'dismissed'
);

-- Create enum for milestone status
CREATE TYPE public.milestone_status AS ENUM (
  'not_started',
  'in_progress',
  'completed',
  'overdue',
  'at_risk'
);

-- Project milestones table
CREATE TABLE public.project_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  phase_id TEXT,
  target_date DATE NOT NULL,
  completed_date DATE,
  status milestone_status NOT NULL DEFAULT 'not_started',
  owner_id UUID REFERENCES public.profiles(id),
  reminder_days INTEGER[] DEFAULT '{7, 3, 1}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

-- RLS policies for milestones
CREATE POLICY "Authenticated users can view milestones"
ON public.project_milestones FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can insert milestones"
ON public.project_milestones FOR INSERT
WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update milestones"
ON public.project_milestones FOR UPDATE
USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete milestones"
ON public.project_milestones FOR DELETE
USING (current_user_has_role('manager'::app_role));

-- Workflow notifications table
CREATE TABLE public.workflow_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  project_id TEXT,
  notification_type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  action_label TEXT,
  priority TEXT DEFAULT 'normal',
  status notification_status NOT NULL DEFAULT 'pending',
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications"
ON public.workflow_notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
ON public.workflow_notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
ON public.workflow_notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Agent analysis runs table
CREATE TABLE public.agent_analysis_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_type TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  analysis_result JSONB,
  recommendations JSONB DEFAULT '[]',
  next_steps JSONB DEFAULT '[]',
  issues_found JSONB DEFAULT '[]',
  notifications_generated INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_analysis_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for analysis runs
CREATE POLICY "Authenticated users can view analysis runs"
ON public.agent_analysis_runs FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert analysis runs"
ON public.agent_analysis_runs FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update analysis runs"
ON public.agent_analysis_runs FOR UPDATE
USING (true);

-- Project workflow state table
CREATE TABLE public.project_workflow_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  current_phase TEXT,
  phase_started_at TIMESTAMP WITH TIME ZONE,
  estimated_completion DATE,
  readiness_score INTEGER DEFAULT 0,
  blockers_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_analysis_at TIMESTAMP WITH TIME ZONE,
  next_recommended_action TEXT,
  workflow_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_workflow_state ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow state
CREATE POLICY "Authenticated users can view workflow state"
ON public.project_workflow_state FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert workflow state"
ON public.project_workflow_state FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update workflow state"
ON public.project_workflow_state FOR UPDATE
USING (true);

-- User notification preferences
CREATE TABLE public.user_notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  deadline_reminders BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  escalations BOOLEAN DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for preferences
CREATE POLICY "Users can view their own preferences"
ON public.user_notification_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.user_notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.user_notification_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_milestones_project ON public.project_milestones(project_id);
CREATE INDEX idx_milestones_target_date ON public.project_milestones(target_date);
CREATE INDEX idx_milestones_status ON public.project_milestones(status);
CREATE INDEX idx_notifications_user ON public.workflow_notifications(user_id);
CREATE INDEX idx_notifications_status ON public.workflow_notifications(status);
CREATE INDEX idx_notifications_created ON public.workflow_notifications(created_at DESC);
CREATE INDEX idx_analysis_runs_project ON public.agent_analysis_runs(project_id);
CREATE INDEX idx_workflow_state_project ON public.project_workflow_state(project_id);

-- Add triggers for updated_at
CREATE TRIGGER update_project_milestones_updated_at
  BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_notifications_updated_at
  BEFORE UPDATE ON public.workflow_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_workflow_state_updated_at
  BEFORE UPDATE ON public.project_workflow_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();