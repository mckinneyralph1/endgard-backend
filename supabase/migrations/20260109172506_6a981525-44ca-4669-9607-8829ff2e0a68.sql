-- Update generate_dccc_from_design_record to log activity
CREATE OR REPLACE FUNCTION public.generate_dccc_from_design_record(p_design_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT name INTO v_created_by_name FROM profiles WHERE id = v_dr.created_by;
  
  -- Get accepter name
  SELECT name INTO v_accepted_by_name FROM profiles WHERE id = v_dr.accepted_by;

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

  -- Log activity for audit trail
  INSERT INTO activity_log (
    project_id,
    entity_type,
    entity_id,
    entity_uid,
    action,
    user_id,
    user_email,
    metadata
  ) VALUES (
    v_dr.project_id,
    'checklist_item',
    v_checklist_id::text,
    'DCCC-' || v_dr.uid,
    'dccc_generated',
    v_dr.created_by,
    (SELECT email FROM auth.users WHERE id = v_dr.created_by),
    jsonb_build_object(
      'source_type', 'design_record',
      'source_uid', v_dr.uid,
      'source_id', p_design_record_id,
      'submitted_by_name', v_created_by_name,
      'accepted_by_name', v_accepted_by_name,
      'category', v_category
    )
  );

  RETURN v_checklist_id;
END;
$function$;

-- Update generate_cscc_from_specification to log activity
CREATE OR REPLACE FUNCTION public.generate_cscc_from_specification(p_specification_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT name INTO v_created_by_name FROM profiles WHERE id = v_spec.created_by;
  
  -- Get accepter name
  SELECT name INTO v_accepted_by_name FROM profiles WHERE id = v_spec.accepted_by;

  -- Get linked design record details
  IF v_spec.design_id IS NOT NULL THEN
    SELECT * INTO v_dr FROM design_records WHERE id = v_spec.design_id;
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
    COALESCE(v_spec.description, ''),
    v_category,
    'construction_phase',
    p_specification_id,
    v_spec.design_id,
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

  -- Log activity for audit trail
  INSERT INTO activity_log (
    project_id,
    entity_type,
    entity_id,
    entity_uid,
    action,
    user_id,
    user_email,
    metadata
  ) VALUES (
    v_spec.project_id,
    'checklist_item',
    v_checklist_id::text,
    'CSCC-' || v_spec.uid,
    'cscc_generated',
    v_spec.created_by,
    (SELECT email FROM auth.users WHERE id = v_spec.created_by),
    jsonb_build_object(
      'source_type', 'specification',
      'source_uid', v_spec.uid,
      'source_id', p_specification_id,
      'linked_design_uid', CASE WHEN v_dr IS NOT NULL THEN v_dr.uid ELSE NULL END,
      'submitted_by_name', v_created_by_name,
      'accepted_by_name', v_accepted_by_name,
      'category', v_category
    )
  );

  RETURN v_checklist_id;
END;
$function$;