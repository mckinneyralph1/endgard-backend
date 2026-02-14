
-- Fix 2: Restrict section_comments visibility
DROP POLICY IF EXISTS "Authenticated users can view section comments" ON public.section_comments;

CREATE POLICY "Users can view own comments or managers can view all"
ON public.section_comments
FOR SELECT
USING (
  user_id = (auth.uid())::text
  OR (SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'manager'::app_role
  ))
);
