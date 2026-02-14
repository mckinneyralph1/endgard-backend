-- Add columns to checklist_items for Implementation tab linking
ALTER TABLE public.checklist_items 
ADD COLUMN IF NOT EXISTS source_design_record_id UUID REFERENCES public.design_records(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_specification_id UUID REFERENCES public.specifications(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS submitted_by_name TEXT,
ADD COLUMN IF NOT EXISTS accepted_by_name TEXT,
ADD COLUMN IF NOT EXISTS accepted_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_checklist_items_source_design_record ON public.checklist_items(source_design_record_id) WHERE source_design_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checklist_items_source_specification ON public.checklist_items(source_specification_id) WHERE source_specification_id IS NOT NULL;

-- Add auto_generate_checklists setting to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS auto_generate_conformance BOOLEAN DEFAULT false;

-- Create function to generate DCCC item from accepted Design Record
CREATE OR REPLACE FUNCTION public.generate_dccc_from_design_record(p_design_record_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dr RECORD;
  v_req RECORD;
  v_created_by_name TEXT;
  v_accepted_by_name TEXT;
  v_checklist_id UUID;
  v_category TEXT;
BEGIN
  -- Get design record details
  SELECT dr.*, p.compliance_framework, p.id as proj_id
  INTO v_dr
  FROM design_records dr
  JOIN projects p ON p.id = dr.project_id
  WHERE dr.id = p_design_record_id;

  IF v_dr IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if already generated
  IF EXISTS (SELECT 1 FROM checklist_items WHERE source_design_record_id = p_design_record_id) THEN
    RETURN NULL;
  END IF;

  -- Get creator name
  SELECT full_name INTO v_created_by_name FROM profiles WHERE id = v_dr.created_by;
  
  -- Get accepter name
  SELECT full_name INTO v_accepted_by_name FROM profiles WHERE id = v_dr.accepted_by;

  -- Get linked requirement details
  IF v_dr.requirement_id IS NOT NULL THEN
    SELECT * INTO v_req FROM requirements WHERE id = v_dr.requirement_id;
  END IF;

  -- Map verification method to category
  v_category := CASE v_dr.verification_method
    WHEN 'analysis' THEN 'design_criteria'
    WHEN 'test' THEN 'safety_requirements'
    WHEN 'inspection' THEN 'design_criteria'
    WHEN 'demonstration' THEN 'safety_requirements'
    ELSE 'design_criteria'
  END;

  -- Create checklist item
  INSERT INTO checklist_items (
    project_id,
    title,
    description,
    category,
    phase_id,
    requirement_id,
    hazard_id,
    source_design_record_id,
    submitted_by,
    submitted_by_name,
    accepted_by_name,
    accepted_date,
    source_reference,
    completed,
    created_at,
    updated_at
  ) VALUES (
    v_dr.project_id,
    v_dr.title || ' - design verified',
    COALESCE(v_dr.description, '') || E'\n\nDesign Approach: ' || COALESCE(v_dr.design_approach, 'N/A') || E'\nMitigation Strategy: ' || COALESCE(v_dr.mitigation_strategy, 'N/A'),
    v_category,
    'design_phase',
    v_dr.requirement_id,
    v_dr.hazard_id,
    p_design_record_id,
    v_dr.created_by,
    v_created_by_name,
    v_accepted_by_name,
    v_dr.accepted_date,
    'Design Record ' || v_dr.uid,
    false,
    now(),
    now()
  )
  RETURNING id INTO v_checklist_id;

  RETURN v_checklist_id;
END;
$$;

-- Create function to generate CSCC item from accepted Specification
CREATE OR REPLACE FUNCTION public.generate_cscc_from_specification(p_specification_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_spec RECORD;
  v_dr RECORD;
  v_created_by_name TEXT;
  v_accepted_by_name TEXT;
  v_checklist_id UUID;
  v_category TEXT;
BEGIN
  -- Get specification details
  SELECT s.*, p.compliance_framework, p.id as proj_id
  INTO v_spec
  FROM specifications s
  JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_specification_id;

  IF v_spec IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if already generated
  IF EXISTS (SELECT 1 FROM checklist_items WHERE source_specification_id = p_specification_id) THEN
    RETURN NULL;
  END IF;

  -- Get creator name
  SELECT full_name INTO v_created_by_name FROM profiles WHERE id = v_spec.created_by;
  
  -- Get accepter name
  SELECT full_name INTO v_accepted_by_name FROM profiles WHERE id = v_spec.accepted_by;

  -- Get linked design record details
  IF v_spec.design_record_id IS NOT NULL THEN
    SELECT * INTO v_dr FROM design_records WHERE id = v_spec.design_record_id;
  END IF;

  -- Map spec type to category
  v_category := CASE v_spec.spec_type
    WHEN 'construction' THEN 'construction_specification'
    WHEN 'installation' THEN 'installation'
    WHEN 'configuration' THEN 'configuration'
    WHEN 'integration' THEN 'integration'
    ELSE 'construction_specification'
  END;

  -- Create checklist item
  INSERT INTO checklist_items (
    project_id,
    title,
    description,
    category,
    phase_id,
    source_specification_id,
    source_design_record_id,
    submitted_by,
    submitted_by_name,
    accepted_by_name,
    accepted_date,
    source_reference,
    completed,
    created_at,
    updated_at
  ) VALUES (
    v_spec.project_id,
    v_spec.title || ' - specification verified',
    COALESCE(v_spec.description, '') || E'\n\nSpecification Details: ' || COALESCE(v_spec.spec_details, 'N/A'),
    v_category,
    'construction_phase',
    p_specification_id,
    v_spec.design_record_id,
    v_spec.created_by,
    v_created_by_name,
    v_accepted_by_name,
    v_spec.accepted_date,
    'Specification ' || v_spec.uid || CASE WHEN v_dr IS NOT NULL THEN ' (from ' || v_dr.uid || ')' ELSE '' END,
    false,
    now(),
    now()
  )
  RETURNING id INTO v_checklist_id;

  RETURN v_checklist_id;
END;
$$;

-- Create trigger function for auto-generation
CREATE OR REPLACE FUNCTION public.auto_generate_conformance_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auto_enabled BOOLEAN;
BEGIN
  -- Check if auto-generation is enabled for this project
  SELECT auto_generate_conformance INTO v_auto_enabled
  FROM projects
  WHERE id = NEW.project_id;

  IF v_auto_enabled = true AND NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    -- Generate based on table
    IF TG_TABLE_NAME = 'design_records' THEN
      PERFORM generate_dccc_from_design_record(NEW.id);
    ELSIF TG_TABLE_NAME = 'specifications' THEN
      PERFORM generate_cscc_from_specification(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers for auto-generation
DROP TRIGGER IF EXISTS auto_generate_dccc_on_design_accept ON public.design_records;
CREATE TRIGGER auto_generate_dccc_on_design_accept
  AFTER UPDATE OF status ON public.design_records
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_conformance_on_accept();

DROP TRIGGER IF EXISTS auto_generate_cscc_on_spec_accept ON public.specifications;
CREATE TRIGGER auto_generate_cscc_on_spec_accept
  AFTER UPDATE OF status ON public.specifications
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_conformance_on_accept();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_dccc_from_design_record(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_cscc_from_specification(UUID) TO authenticated;