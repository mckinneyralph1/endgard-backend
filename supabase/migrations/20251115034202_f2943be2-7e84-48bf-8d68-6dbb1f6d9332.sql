-- Add sil column to requirements table for Safety Integrity Level tracking
ALTER TABLE public.requirements 
ADD COLUMN sil text;