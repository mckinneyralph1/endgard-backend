
-- =============================================
-- 1. VERSION HISTORY TABLES FOR SAFETY-CRITICAL DATA
-- =============================================

-- Hazard version history
CREATE TABLE public.hazard_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hazard_id UUID NOT NULL REFERENCES public.hazards(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  risk_level TEXT,
  severity TEXT,
  likelihood TEXT,
  status TEXT,
  mitigation TEXT,
  mitigation_type TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason TEXT,
  field_changes JSONB
);

-- Requirement version history
CREATE TABLE public.requirement_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requirement_id UUID NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT,
  priority TEXT,
  control_strength TEXT,
  verification_method TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason TEXT,
  field_changes JSONB
);

-- Indexes for fast lookups
CREATE INDEX idx_hazard_versions_hazard_id ON public.hazard_versions(hazard_id);
CREATE INDEX idx_hazard_versions_changed_at ON public.hazard_versions(changed_at DESC);
CREATE INDEX idx_requirement_versions_requirement_id ON public.requirement_versions(requirement_id);
CREATE INDEX idx_requirement_versions_changed_at ON public.requirement_versions(changed_at DESC);

-- Enable RLS
ALTER TABLE public.hazard_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_versions ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read versions for projects they have access to
CREATE POLICY "Authenticated users can read hazard versions"
  ON public.hazard_versions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read requirement versions"
  ON public.requirement_versions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- System can insert versions (via triggers)
CREATE POLICY "System can insert hazard versions"
  ON public.hazard_versions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can insert requirement versions"
  ON public.requirement_versions FOR INSERT
  WITH CHECK (true);

-- =============================================
-- 2. VERSIONING TRIGGER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.version_hazard_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version INT;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  -- Only version if substantive fields changed
  IF OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.description IS NOT DISTINCT FROM NEW.description
     AND OLD.risk_level IS NOT DISTINCT FROM NEW.risk_level
     AND OLD.severity IS NOT DISTINCT FROM NEW.severity
     AND OLD.likelihood IS NOT DISTINCT FROM NEW.likelihood
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.mitigation IS NOT DISTINCT FROM NEW.mitigation
     AND OLD.mitigation_type IS NOT DISTINCT FROM NEW.mitigation_type
  THEN
    RETURN NEW;
  END IF;

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM hazard_versions WHERE hazard_id = OLD.id;

  -- Build field changes
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', OLD.title, 'new', NEW.title));
  END IF;
  IF OLD.risk_level IS DISTINCT FROM NEW.risk_level THEN
    v_changes := v_changes || jsonb_build_object('risk_level', jsonb_build_object('old', OLD.risk_level, 'new', NEW.risk_level));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
  END IF;
  IF OLD.mitigation IS DISTINCT FROM NEW.mitigation THEN
    v_changes := v_changes || jsonb_build_object('mitigation', jsonb_build_object('old', OLD.mitigation, 'new', NEW.mitigation));
  END IF;

  -- Snapshot the OLD row
  INSERT INTO hazard_versions (
    hazard_id, version_number, title, description, risk_level,
    severity, likelihood, status, mitigation, mitigation_type,
    changed_by, field_changes
  ) VALUES (
    OLD.id, v_version, OLD.title, OLD.description, OLD.risk_level,
    OLD.severity, OLD.likelihood, OLD.status, OLD.mitigation, OLD.mitigation_type,
    auth.uid(), v_changes
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.version_requirement_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version INT;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  IF OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.description IS NOT DISTINCT FROM NEW.description
     AND OLD.category IS NOT DISTINCT FROM NEW.category
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.priority IS NOT DISTINCT FROM NEW.priority
     AND OLD.control_strength IS NOT DISTINCT FROM NEW.control_strength
     AND OLD.verification_method IS NOT DISTINCT FROM NEW.verification_method
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM requirement_versions WHERE requirement_id = OLD.id;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', OLD.title, 'new', NEW.title));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
  END IF;
  IF OLD.control_strength IS DISTINCT FROM NEW.control_strength THEN
    v_changes := v_changes || jsonb_build_object('control_strength', jsonb_build_object('old', OLD.control_strength, 'new', NEW.control_strength));
  END IF;

  INSERT INTO requirement_versions (
    requirement_id, version_number, title, description, category,
    status, priority, control_strength, verification_method,
    changed_by, field_changes
  ) VALUES (
    OLD.id, v_version, OLD.title, OLD.description, OLD.category,
    OLD.status, OLD.priority, OLD.control_strength, OLD.verification_method,
    auth.uid(), v_changes
  );

  RETURN NEW;
END;
$$;

-- =============================================
-- 3. ATTACH TRIGGERS
-- =============================================

CREATE TRIGGER trg_version_hazard
  BEFORE UPDATE ON public.hazards
  FOR EACH ROW
  EXECUTE FUNCTION public.version_hazard_on_update();

CREATE TRIGGER trg_version_requirement
  BEFORE UPDATE ON public.requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.version_requirement_on_update();
