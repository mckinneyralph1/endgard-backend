-- Create comprehensive activity log table for audit trail
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  entity_type TEXT NOT NULL, -- 'requirement', 'hazard', 'test_case', 'certifiable_element', 'checklist_item', 'design_record', 'specification', 'approval'
  entity_id TEXT NOT NULL,
  entity_uid TEXT, -- Human-readable UID like REQ-001
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject', 'submit', 'execute'
  field_changes JSONB, -- { field_name: { old: value, new: value } }
  metadata JSONB, -- Additional context like linked items, approval details
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_activity_log_project ON public.activity_log(project_id);
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_user ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_created ON public.activity_log(created_at DESC);
CREATE INDEX idx_activity_log_action ON public.activity_log(action);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies: Only managers, project members, and auditors can view logs
CREATE POLICY "Users can view activity logs for their projects"
ON public.activity_log
FOR SELECT
USING (
  public.user_has_project_access(auth.uid(), project_id)
);

-- Only authenticated users can insert activity logs
CREATE POLICY "Authenticated users can create activity logs"
ON public.activity_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime for activity log
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;

-- Create function to log activity
CREATE OR REPLACE FUNCTION public.log_activity(
  p_project_id TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_entity_uid TEXT,
  p_action TEXT,
  p_field_changes JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_log_id UUID;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Insert activity log
  INSERT INTO public.activity_log (
    project_id,
    user_id,
    user_email,
    entity_type,
    entity_id,
    entity_uid,
    action,
    field_changes,
    metadata
  ) VALUES (
    p_project_id,
    auth.uid(),
    v_user_email,
    p_entity_type,
    p_entity_id,
    p_entity_uid,
    p_action,
    p_field_changes,
    p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;