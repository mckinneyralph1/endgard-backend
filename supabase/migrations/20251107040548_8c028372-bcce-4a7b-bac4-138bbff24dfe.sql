-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.section_comments CASCADE;
DROP TABLE IF EXISTS public.section_history CASCADE;
DROP FUNCTION IF EXISTS public.log_section_change() CASCADE;

-- Create section_comments table for discussion threads
CREATE TABLE public.section_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create section_history table for change tracking
CREATE TABLE public.section_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.section_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for section_comments
CREATE POLICY "Anyone can view section comments"
ON public.section_comments
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert comments"
ON public.section_comments
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own comments"
ON public.section_comments
FOR UPDATE
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own comments"
ON public.section_comments
FOR DELETE
USING (auth.uid()::text = user_id);

-- RLS Policies for section_history
CREATE POLICY "Anyone can view section history"
ON public.section_history
FOR SELECT
USING (true);

CREATE POLICY "System can insert history"
ON public.section_history
FOR INSERT
WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX idx_section_comments_section_id ON public.section_comments(section_id);
CREATE INDEX idx_section_comments_created_at ON public.section_comments(created_at DESC);
CREATE INDEX idx_section_history_section_id ON public.section_history(section_id);
CREATE INDEX idx_section_history_created_at ON public.section_history(created_at DESC);

-- Create trigger for updated_at on section_comments
CREATE TRIGGER update_section_comments_updated_at
BEFORE UPDATE ON public.section_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for comments
ALTER TABLE section_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE section_comments;

-- Create function to log section changes
CREATE OR REPLACE FUNCTION public.log_section_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log content changes
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO public.section_history (section_id, user_id, user_email, action, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid()::text, COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'System'), 'update', 'content', OLD.content, NEW.content);
  END IF;
  
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.section_history (section_id, user_id, user_email, action, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid()::text, COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'System'), 'update', 'status', OLD.status, NEW.status);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for section changes
CREATE TRIGGER track_section_changes
AFTER UPDATE ON public.report_sections
FOR EACH ROW
EXECUTE FUNCTION public.log_section_change();