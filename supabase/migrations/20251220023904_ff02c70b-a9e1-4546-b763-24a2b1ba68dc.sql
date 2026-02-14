
-- Add ce_id column to requirements table to link requirements to certifiable elements
ALTER TABLE requirements 
ADD COLUMN ce_id uuid REFERENCES certifiable_elements(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_requirements_ce_id ON requirements(ce_id);
