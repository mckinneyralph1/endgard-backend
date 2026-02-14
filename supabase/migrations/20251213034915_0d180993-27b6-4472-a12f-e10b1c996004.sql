-- Enable realtime for workflow_notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_notifications;

-- Enable realtime for project_workflow_state table
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_workflow_state;