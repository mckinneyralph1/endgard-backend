-- Extend change_request_impacts with invalidation/revalidation workflow fields
ALTER TABLE public.change_request_impacts
ADD COLUMN IF NOT EXISTS invalidation_status TEXT DEFAULT 'pending' CHECK (invalidation_status IN ('pending', 'invalidated', 'revalidated', 'dismissed')),
ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ai_revalidation_confidence INTEGER CHECK (ai_revalidation_confidence >= 0 AND ai_revalidation_confidence <= 100),
ADD COLUMN IF NOT EXISTS ai_revalidation_rationale TEXT,
ADD COLUMN IF NOT EXISTS ai_assessed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS revalidated_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS revalidated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS revalidation_notes TEXT,
ADD COLUMN IF NOT EXISTS affected_item_title TEXT;

-- Add index for efficient querying of pending invalidations
CREATE INDEX IF NOT EXISTS idx_change_request_impacts_status 
ON public.change_request_impacts(invalidation_status) 
WHERE invalidation_status IN ('pending', 'invalidated');

-- Add index for project-level queries (via change_request)
CREATE INDEX IF NOT EXISTS idx_change_request_impacts_cr_id 
ON public.change_request_impacts(change_request_id);

COMMENT ON COLUMN public.change_request_impacts.invalidation_status IS 'Workflow status: pending (awaiting action), invalidated (flagged for review), revalidated (AI-suggested, human-confirmed still valid), dismissed (no action needed)';
COMMENT ON COLUMN public.change_request_impacts.ai_revalidation_confidence IS 'AI confidence 0-100 that existing evidence remains valid despite the change';
COMMENT ON COLUMN public.change_request_impacts.ai_revalidation_rationale IS 'AI explanation of why item may still be valid';