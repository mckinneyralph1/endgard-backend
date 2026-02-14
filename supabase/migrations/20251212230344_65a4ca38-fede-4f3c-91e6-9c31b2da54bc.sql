
-- Fix 3: Restrict project updates - only project creator or managers can update
DROP POLICY IF EXISTS "Authenticated users can update projects" ON public.projects;

CREATE POLICY "Project creators and managers can update projects"
ON public.projects
FOR UPDATE
USING (
  created_by = auth.uid()
  OR (SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'manager'::app_role
  ))
);
