-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view section comments" ON public.section_comments;

-- Create authenticated-only SELECT policy
CREATE POLICY "Authenticated users can view section comments" 
ON public.section_comments 
FOR SELECT 
TO authenticated
USING (true);