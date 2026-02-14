
-- Add phase_id and tab_mapping columns to checklist_category_config
ALTER TABLE checklist_category_config 
ADD COLUMN IF NOT EXISTS phase_id text,
ADD COLUMN IF NOT EXISTS tab_mapping text;

-- Update FTA categories with phase and tab mappings
UPDATE checklist_category_config SET phase_id = 'identify_ces', tab_mapping = 'ce' 
WHERE framework = 'FTA' AND category_key IN ('planning', 'system_definition', 'ce_identification');

UPDATE checklist_category_config SET phase_id = 'design_criteria', tab_mapping = 'requirements' 
WHERE framework = 'FTA' AND category_key IN ('requirements', 'design_criteria', 'safety_security');

UPDATE checklist_category_config SET phase_id = 'conformance_checklists', tab_mapping = 'design' 
WHERE framework = 'FTA' AND category_key IN ('design_conformance', 'design_review', 'checklists');

UPDATE checklist_category_config SET phase_id = 'construction_specs', tab_mapping = 'construction' 
WHERE framework = 'FTA' AND category_key IN ('construction_specification', 'installation', 'compliance_review');

UPDATE checklist_category_config SET phase_id = 'installation_testing', tab_mapping = 'construction' 
WHERE framework = 'FTA' AND category_key IN ('installation_conformance', 'testing_conformance', 'validation');

UPDATE checklist_category_config SET phase_id = 'test_requirements', tab_mapping = 'testing' 
WHERE framework = 'FTA' AND category_key IN ('test_planning', 'hazard_analysis', 'test_requirements');

UPDATE checklist_category_config SET phase_id = 'testing_validation', tab_mapping = 'testing' 
WHERE framework = 'FTA' AND category_key IN ('verification_testing', 'validation_testing', 'ssc_support');

UPDATE checklist_category_config SET phase_id = 'integrated_testing', tab_mapping = 'testing' 
WHERE framework = 'FTA' AND category_key IN ('integration_testing', 'interface_validation', 'ssc_testing');

UPDATE checklist_category_config SET phase_id = 'open_items', tab_mapping = 'open_items' 
WHERE framework = 'FTA' AND category_key IN ('hazard_management', 'nonconformance_tracking', 'oil_management');

UPDATE checklist_category_config SET phase_id = 'operational_readiness', tab_mapping = 'operations' 
WHERE framework = 'FTA' AND category_key IN ('operational_readiness', 'prsr', 'readiness_verification');

UPDATE checklist_category_config SET phase_id = 'final_certification', tab_mapping = 'gates' 
WHERE framework = 'FTA' AND category_key IN ('certification', 'final_approval', 'ssc_vr');
