-- Add parent_id to certifiable_elements to support sub-elements hierarchy
ALTER TABLE certifiable_elements 
ADD COLUMN parent_id uuid REFERENCES certifiable_elements(id) ON DELETE CASCADE;

-- Add index for better performance when querying hierarchies
CREATE INDEX idx_certifiable_elements_parent_id ON certifiable_elements(parent_id);

-- Add display_order column to control ordering within the same parent
ALTER TABLE certifiable_elements 
ADD COLUMN display_order integer DEFAULT 0;

COMMENT ON COLUMN certifiable_elements.parent_id IS 'Reference to parent element for creating sub-element hierarchy';
COMMENT ON COLUMN certifiable_elements.display_order IS 'Order of elements within the same parent level';