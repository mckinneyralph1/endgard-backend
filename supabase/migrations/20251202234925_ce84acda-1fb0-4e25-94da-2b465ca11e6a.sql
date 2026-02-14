-- Drop the restrictive category constraint
ALTER TABLE public.checklist_items DROP CONSTRAINT IF EXISTS checklist_items_category_check;

-- Add a more comprehensive category constraint that includes all checklist categories
ALTER TABLE public.checklist_items ADD CONSTRAINT checklist_items_category_check 
CHECK (category = ANY (ARRAY[
  -- CE identification
  'system_definition', 'ce_identification',
  -- Design criteria
  'requirements', 'design_criteria', 'safety_security',
  -- Conformance
  'design_conformance', 'design_review',
  -- Construction
  'construction_specification', 'installation', 'compliance_review',
  -- Installation/Testing
  'installation_conformance', 'testing_conformance', 'validation',
  -- Test requirements
  'test_planning', 'hazard_analysis', 'test_requirements',
  -- Testing & validation
  'verification_testing', 'validation_testing', 'ssc_support',
  -- Integrated testing
  'integration_testing', 'interface_validation', 'ssc_testing',
  -- Open items
  'hazard_management', 'nonconformance_tracking', 'oil_management',
  -- PRO Operational Readiness (OP 54)
  'pro_planning', 'emergency_preparedness', 'rule_book_sops', 
  'training_program', 'public_awareness', 'readiness_verification',
  -- Final certification
  'certification', 'final_approval', 'ssc_vr',
  -- Legacy
  'operational_readiness', 'prsr', 'documentation'
]));