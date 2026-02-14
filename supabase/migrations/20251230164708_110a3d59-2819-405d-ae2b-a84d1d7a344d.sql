-- Create calendar_events table for custom project events
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'custom',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT true,
  color TEXT,
  location TEXT,
  assignee_ids UUID[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for project lookups
CREATE INDEX idx_calendar_events_project_id ON public.calendar_events(project_id);
CREATE INDEX idx_calendar_events_start_date ON public.calendar_events(start_date);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar_events
CREATE POLICY "Users can view calendar events" 
ON public.calendar_events 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create calendar events" 
ON public.calendar_events 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own calendar events" 
ON public.calendar_events 
FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own calendar events" 
ON public.calendar_events 
FOR DELETE 
USING (auth.uid() = created_by);

-- Add due_date to checklist_items if not exists
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS due_date DATE;

-- Create trigger for updated_at
CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for calendar_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;