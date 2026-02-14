-- Create user access control tables for standards library

-- Track which industries users have access to
CREATE TABLE IF NOT EXISTS public.user_industry_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  industry_id UUID NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, industry_id)
);

-- Track which categories users have access to (more granular control)
CREATE TABLE IF NOT EXISTS public.user_category_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.standards_library_categories(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, category_id)
);

-- Enable RLS
ALTER TABLE public.user_industry_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_category_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_industry_access
CREATE POLICY "Users can view their own industry access"
  ON public.user_industry_access FOR SELECT
  USING (auth.uid() = user_id OR current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can grant industry access"
  ON public.user_industry_access FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can revoke industry access"
  ON public.user_industry_access FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- RLS Policies for user_category_access
CREATE POLICY "Users can view their own category access"
  ON public.user_category_access FOR SELECT
  USING (auth.uid() = user_id OR current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can grant category access"
  ON public.user_category_access FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can revoke category access"
  ON public.user_category_access FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Create security definer functions to check access
CREATE OR REPLACE FUNCTION public.user_has_industry_access(_user_id UUID, _industry_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Managers have access to everything
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'manager'::app_role
    ) THEN true
    -- Regular users need explicit access grant
    WHEN EXISTS (
      SELECT 1 FROM public.user_industry_access
      WHERE user_id = _user_id AND industry_id = _industry_id
    ) THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.user_has_category_access(_user_id UUID, _category_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    -- Managers have access to everything
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'manager'::app_role
    ) THEN true
    -- Check category-level access first
    WHEN EXISTS (
      SELECT 1 FROM public.user_category_access
      WHERE user_id = _user_id AND category_id = _category_id
    ) THEN true
    -- Fall back to industry-level access
    WHEN EXISTS (
      SELECT 1 FROM public.user_industry_access uia
      JOIN public.standards_library_categories slc ON slc.industry_id = uia.industry_id
      WHERE uia.user_id = _user_id AND slc.id = _category_id
    ) THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.user_has_standard_access(_user_id UUID, _standard_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    -- Managers have access to everything
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'manager'::app_role
    ) THEN true
    -- Check via category access
    WHEN EXISTS (
      SELECT 1 FROM public.standards_library_standards sls
      WHERE sls.id = _standard_id
        AND public.user_has_category_access(_user_id, sls.category_id)
    ) THEN true
    ELSE false
  END
$$;

-- Update RLS policies on standards library tables to enforce access control
DROP POLICY IF EXISTS "Anyone can view standards industries" ON public.standards_library_industries;
CREATE POLICY "Users can view industries they have access to"
  ON public.standards_library_industries FOR SELECT
  USING (
    current_user_has_role('manager'::app_role) OR
    public.user_has_industry_access(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Anyone can view standards categories" ON public.standards_library_categories;
CREATE POLICY "Users can view categories they have access to"
  ON public.standards_library_categories FOR SELECT
  USING (
    current_user_has_role('manager'::app_role) OR
    public.user_has_category_access(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Anyone can view standards" ON public.standards_library_standards;
CREATE POLICY "Users can view standards they have access to"
  ON public.standards_library_standards FOR SELECT
  USING (
    current_user_has_role('manager'::app_role) OR
    public.user_has_standard_access(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Anyone can view standards documents" ON public.standards_library_documents;
CREATE POLICY "Users can view documents for accessible standards"
  ON public.standards_library_documents FOR SELECT
  USING (
    current_user_has_role('manager'::app_role) OR
    public.user_has_standard_access(auth.uid(), standard_id)
  );

-- Add project-industry association
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS primary_industry_id UUID REFERENCES public.standards_library_industries(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_industry_access_user ON public.user_industry_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_category_access_user ON public.user_category_access(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_industry ON public.projects(primary_industry_id);