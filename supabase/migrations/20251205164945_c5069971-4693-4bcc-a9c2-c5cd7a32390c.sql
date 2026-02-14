-- Fix the project with invalid ID "2" by giving it a proper UUID
UPDATE projects 
SET id = gen_random_uuid() 
WHERE id = '2';

-- Also add missing categories to the check constraint to support GENERIC framework
ALTER TABLE checklist_items DROP CONSTRAINT IF EXISTS checklist_items_category_check;
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_category_check 
CHECK (category = ANY (ARRAY[
  'system_definition', 'ce_identification', 'requirements', 'design_criteria', 
  'safety_security', 'design_conformance', 'design_review', 'construction_specification', 
  'installation', 'compliance_review', 'installation_conformance', 'testing_conformance', 
  'validation', 'test_planning', 'hazard_analysis', 'test_requirements', 
  'verification_testing', 'validation_testing', 'ssc_support', 'integration_testing', 
  'interface_validation', 'ssc_testing', 'hazard_management', 'nonconformance_tracking', 
  'oil_management', 'pro_planning', 'emergency_preparedness', 'rule_book_sops', 
  'training_program', 'public_awareness', 'readiness_verification', 'certification', 
  'final_approval', 'ssc_vr', 'operational_readiness', 'prsr', 'documentation',
  -- Adding GENERIC framework categories
  'planning', 'implementation'
]));