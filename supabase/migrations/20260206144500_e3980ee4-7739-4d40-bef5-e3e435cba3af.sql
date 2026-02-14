
-- Notification preferences per user
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Channel preferences
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Event type preferences
  approval_needed BOOLEAN NOT NULL DEFAULT true,
  status_change BOOLEAN NOT NULL DEFAULT true,
  deadline_reminder BOOLEAN NOT NULL DEFAULT true,
  escalation BOOLEAN NOT NULL DEFAULT true,
  milestone_alert BOOLEAN NOT NULL DEFAULT true,
  blocker_created BOOLEAN NOT NULL DEFAULT true,
  blocker_resolved BOOLEAN NOT NULL DEFAULT true,
  -- Digest preferences
  digest_frequency TEXT NOT NULL DEFAULT 'none' CHECK (digest_frequency IN ('none', 'daily', 'weekly')),
  digest_day_of_week INTEGER DEFAULT 1, -- 0=Sun, 1=Mon, etc.
  digest_hour INTEGER DEFAULT 9, -- Hour in UTC
  -- Quiet hours
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start INTEGER DEFAULT 22, -- 10 PM UTC
  quiet_hours_end INTEGER DEFAULT 7, -- 7 AM UTC
  --
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto update updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Escalation rules per project
CREATE TABLE public.escalation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  -- What triggers the escalation
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('blocker_overdue', 'approval_overdue', 'checklist_overdue', 'test_failure')),
  -- Time threshold in hours before escalation fires
  threshold_hours INTEGER NOT NULL DEFAULT 48,
  -- Who gets escalated to (role-based)
  escalate_to_role TEXT NOT NULL DEFAULT 'manager' CHECK (escalate_to_role IN ('manager', 'admin', 'owner', 'approver')),
  -- Optional specific user to escalate to
  escalate_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Severity of the escalation notification
  escalation_priority TEXT NOT NULL DEFAULT 'high' CHECK (escalation_priority IN ('normal', 'high', 'urgent')),
  -- Whether to send email in addition to in-app
  send_email BOOLEAN NOT NULL DEFAULT true,
  -- Active flag
  is_active BOOLEAN NOT NULL DEFAULT true,
  --
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;

-- Project members can view escalation rules
CREATE POLICY "Project members can view escalation rules"
  ON public.escalation_rules FOR SELECT
  TO authenticated
  USING (public.user_has_project_access(auth.uid(), project_id));

-- Managers/admins can manage escalation rules
CREATE POLICY "Managers can insert escalation rules"
  ON public.escalation_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_permission(auth.uid(), 'admin')
  );

CREATE POLICY "Managers can update escalation rules"
  ON public.escalation_rules FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_permission(auth.uid(), 'admin')
  );

CREATE POLICY "Managers can delete escalation rules"
  ON public.escalation_rules FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') OR 
    public.has_permission(auth.uid(), 'admin')
  );

CREATE TRIGGER update_escalation_rules_updated_at
  BEFORE UPDATE ON public.escalation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Escalation log to track when escalations fire
CREATE TABLE public.escalation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES public.escalation_rules(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  trigger_entity_type TEXT NOT NULL,
  trigger_entity_id TEXT NOT NULL,
  escalated_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_id UUID REFERENCES public.workflow_notifications(id) ON DELETE SET NULL,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escalation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view escalation logs"
  ON public.escalation_log FOR SELECT
  TO authenticated
  USING (public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "System can insert escalation logs"
  ON public.escalation_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add email_sent tracking to workflow_notifications
ALTER TABLE public.workflow_notifications 
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
