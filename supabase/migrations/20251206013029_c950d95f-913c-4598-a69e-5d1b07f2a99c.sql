-- Create table to store which tabs are hidden per industry
CREATE TABLE public.industry_hidden_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_id uuid NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  tab_key text NOT NULL,
  hidden_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (industry_id, tab_key)
);

-- Enable RLS
ALTER TABLE public.industry_hidden_tabs ENABLE ROW LEVEL SECURITY;

-- Anyone can view hidden tabs configuration
CREATE POLICY "Anyone can view hidden tabs"
ON public.industry_hidden_tabs
FOR SELECT
USING (true);

-- Only admins can manage hidden tabs
CREATE POLICY "Admins can insert hidden tabs"
ON public.industry_hidden_tabs
FOR INSERT
WITH CHECK (current_user_has_permission('admin'::app_permission));

CREATE POLICY "Admins can delete hidden tabs"
ON public.industry_hidden_tabs
FOR DELETE
USING (current_user_has_permission('admin'::app_permission));