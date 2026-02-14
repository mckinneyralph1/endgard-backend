-- Rename expiry_date to signed_date in certificates table
ALTER TABLE public.certificates 
RENAME COLUMN expiry_date TO signed_date;

-- Update the default template to reflect the new field name
UPDATE public.certificate_templates 
SET body_text = REPLACE(
  REPLACE(body_text, '{expiry_date}', '{signed_date}'),
  'valid from {issue_date} to {expiry_date}',
  'officially signed and certified on {signed_date}'
),
footer_text = REPLACE(footer_text, '{expiry_date}', '{signed_date}')
WHERE is_default = true;