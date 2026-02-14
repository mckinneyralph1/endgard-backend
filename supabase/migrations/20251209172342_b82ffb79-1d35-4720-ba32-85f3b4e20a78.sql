-- Add approval_method and bypass tracking fields to test_procedures
ALTER TABLE public.test_procedures 
ADD COLUMN approval_method TEXT DEFAULT 'standard',
ADD COLUMN bypass_justification TEXT,
ADD COLUMN bypass_approved_by TEXT,
ADD COLUMN source_procedure_id UUID REFERENCES public.test_procedures(id);

-- Add comment for documentation
COMMENT ON COLUMN public.test_procedures.approval_method IS 'How the procedure was approved: standard, template_import, bulk_approval, emergency_override, inherited_approval';
COMMENT ON COLUMN public.test_procedures.bypass_justification IS 'Required justification when using bypass approval methods';
COMMENT ON COLUMN public.test_procedures.source_procedure_id IS 'Reference to source procedure when using inherited_approval';