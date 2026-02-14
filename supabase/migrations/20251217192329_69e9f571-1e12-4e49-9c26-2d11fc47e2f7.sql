-- Add parent-child hierarchy to requirements
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES requirements(id) ON DELETE SET NULL;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS requirement_type TEXT DEFAULT 'system';

-- Create index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_requirements_parent_id ON requirements(parent_id);
CREATE INDEX IF NOT EXISTS idx_requirements_hierarchy ON requirements(project_id, hierarchy_level);

-- Create change_requests table
CREATE TABLE IF NOT EXISTS public.change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  priority TEXT NOT NULL DEFAULT 'medium',
  impact_summary TEXT,
  requested_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  requested_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_date TIMESTAMP WITH TIME ZONE,
  approved_date TIMESTAMP WITH TIME ZONE,
  implementation_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create change_request_impacts table
CREATE TABLE IF NOT EXISTS public.change_request_impacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  change_request_id UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  affected_item_type TEXT NOT NULL,
  affected_item_id UUID NOT NULL,
  impact_type TEXT NOT NULL,
  impact_description TEXT,
  severity TEXT DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_change_requests_project ON change_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_request_impacts_cr ON change_request_impacts(change_request_id);

-- Enable RLS
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_request_impacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for change_requests
CREATE POLICY "Authenticated users can view change requests"
  ON change_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create change requests"
  ON change_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update change requests"
  ON change_requests FOR UPDATE
  USING (current_user_has_role('manager'::app_role) OR requested_by = auth.uid());

CREATE POLICY "Managers can delete change requests"
  ON change_requests FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- RLS policies for change_request_impacts
CREATE POLICY "Authenticated users can view impacts"
  ON change_request_impacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create impacts"
  ON change_request_impacts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update impacts"
  ON change_request_impacts FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete impacts"
  ON change_request_impacts FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Enable realtime for change_requests
ALTER PUBLICATION supabase_realtime ADD TABLE change_requests;

-- Add updated_at trigger
CREATE TRIGGER update_change_requests_updated_at
  BEFORE UPDATE ON change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();