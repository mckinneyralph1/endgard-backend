-- Enable real-time for projects table
ALTER TABLE public.projects REPLICA IDENTITY FULL;

-- Add projects table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;