
-- Table for storing configured document control platform destinations
CREATE TABLE public.export_destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('sharepoint', 'google_drive', 'webhook')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_upload_at TIMESTAMPTZ,
  last_upload_status TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.export_destinations ENABLE ROW LEVEL SECURITY;

-- Policies: only authenticated project members
CREATE POLICY "Users can view destinations for their projects"
  ON public.export_destinations FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create destinations for their projects"
  ON public.export_destinations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update destinations for their projects"
  ON public.export_destinations FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete destinations for their projects"
  ON public.export_destinations FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

-- Upload log for audit trail
CREATE TABLE public.export_upload_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  destination_id UUID NOT NULL REFERENCES public.export_destinations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'success', 'failed')),
  error_message TEXT,
  response_data JSONB
);

ALTER TABLE public.export_upload_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view upload logs for their projects"
  ON public.export_upload_log FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create upload logs"
  ON public.export_upload_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update upload logs"
  ON public.export_upload_log FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.user_has_project_access(auth.uid(), project_id));

-- Timestamp trigger
CREATE TRIGGER update_export_destinations_updated_at
  BEFORE UPDATE ON public.export_destinations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
