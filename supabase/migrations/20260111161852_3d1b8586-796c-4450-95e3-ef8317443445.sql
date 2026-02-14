-- Add assigned reviewer to change_request_impacts for hybrid revalidation workflow
ALTER TABLE public.change_request_impacts 
ADD COLUMN assigned_reviewer_id uuid REFERENCES public.profiles(id),
ADD COLUMN assigned_at timestamp with time zone,
ADD COLUMN notification_sent_at timestamp with time zone;

-- Add index for efficient lookup of pending reviews by user
CREATE INDEX idx_change_request_impacts_assigned_reviewer 
ON public.change_request_impacts(assigned_reviewer_id) 
WHERE invalidation_status = 'pending';

-- Comment for documentation
COMMENT ON COLUMN public.change_request_impacts.assigned_reviewer_id IS 'Auto-populated from original acceptor, can be overridden by manager';
COMMENT ON COLUMN public.change_request_impacts.assigned_at IS 'When the reviewer was assigned';
COMMENT ON COLUMN public.change_request_impacts.notification_sent_at IS 'When notification was sent to reviewer';