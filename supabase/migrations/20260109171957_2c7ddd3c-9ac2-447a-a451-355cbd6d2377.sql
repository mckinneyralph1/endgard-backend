-- Drop the existing category check constraint
ALTER TABLE checklist_items DROP CONSTRAINT IF EXISTS checklist_items_category_check;

-- Add a more comprehensive category check constraint
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_category_check 
CHECK (category IN (
  -- Design categories
  'design_criteria', 'design_conformance', 'design_review', 'safety_requirements',
  -- Construction categories  
  'construction_specification', 'construction', 'installation', 'configuration', 'integration', 'compliance_review',
  -- Operations categories
  'operational_readiness', 'pro_planning', 'emergency_preparedness', 'rule_book_sops', 
  'training_program', 'public_awareness', 'readiness_verification', 'prsr',
  -- Testing categories
  'verification_testing', 'validation_testing', 'test_planning', 'test_requirements', 'integration_testing',
  -- General
  'general', 'other'
));