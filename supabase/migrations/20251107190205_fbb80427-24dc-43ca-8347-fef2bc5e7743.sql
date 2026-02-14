-- Add body_text column to certificates table to allow per-certificate customization
ALTER TABLE public.certificates 
ADD COLUMN body_text text;

-- Add a comment explaining the column
COMMENT ON COLUMN public.certificates.body_text IS 'Custom body text for this certificate. If null, uses template body text.';