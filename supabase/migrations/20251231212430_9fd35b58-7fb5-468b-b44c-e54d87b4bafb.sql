-- Fix remaining critical security issues (corrected version)

-- 1. Fix calendar_events - remove overly permissive policy
DROP POLICY IF EXISTS "Users can view calendar events" ON public.calendar_events;

-- 2. Fix section_comments - restrict to project access via report_templates
DROP POLICY IF EXISTS "Authenticated users can view section comments" ON public.section_comments;
DROP POLICY IF EXISTS "Users can view all comments" ON public.section_comments;
CREATE POLICY "Users can view comments for accessible sections"
ON public.section_comments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.report_sections rs
    JOIN public.report_templates r ON r.id = rs.report_id
    WHERE rs.id = section_comments.section_id
    AND public.user_has_project_access(auth.uid(), r.project_id::text)
  )
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 3. Fix section_history - restrict to project access via report_templates
DROP POLICY IF EXISTS "Authenticated users can view section history" ON public.section_history;
DROP POLICY IF EXISTS "Users can view section history" ON public.section_history;
CREATE POLICY "Users can view history for accessible sections"
ON public.section_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.report_sections rs
    JOIN public.report_templates r ON r.id = rs.report_id
    WHERE rs.id = section_history.section_id
    AND public.user_has_project_access(auth.uid(), r.project_id::text)
  )
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 4. Fix blocker_history - restrict to project access via project_blockers
DROP POLICY IF EXISTS "Authenticated users can view blocker history" ON public.blocker_history;
DROP POLICY IF EXISTS "Users can view blocker history" ON public.blocker_history;
CREATE POLICY "Users can view history for accessible blockers"
ON public.blocker_history FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_blockers pb
    WHERE pb.id = blocker_history.blocker_id
    AND public.user_has_project_access(auth.uid(), pb.project_id::text)
  )
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 5. Fix certificate_signatures - restrict to project access via certificates
DROP POLICY IF EXISTS "Authenticated users can view certificate signatures" ON public.certificate_signatures;
DROP POLICY IF EXISTS "Users can view certificate signatures" ON public.certificate_signatures;
CREATE POLICY "Users can view signatures for accessible certificates"
ON public.certificate_signatures FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.certificates c
    WHERE c.id = certificate_signatures.certificate_id
    AND public.user_has_project_access(auth.uid(), c.project_id::text)
  )
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 6. Fix ai_workflow_artifacts - restrict to project access via workflow runs
DROP POLICY IF EXISTS "Authenticated users can view workflow artifacts" ON public.ai_workflow_artifacts;
DROP POLICY IF EXISTS "Users can view workflow artifacts" ON public.ai_workflow_artifacts;
CREATE POLICY "Users can view artifacts for accessible projects"
ON public.ai_workflow_artifacts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_workflow_runs wr
    WHERE wr.id = ai_workflow_artifacts.workflow_run_id
    AND public.user_has_project_access(auth.uid(), wr.project_id::text)
  )
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- 7. Fix ai_workflow_runs - restrict to project access
DROP POLICY IF EXISTS "Authenticated users can view workflow runs" ON public.ai_workflow_runs;
DROP POLICY IF EXISTS "Users can view workflow runs" ON public.ai_workflow_runs;
CREATE POLICY "Users can view workflow runs for accessible projects"
ON public.ai_workflow_runs FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- 8. Fix ai_workflow_steps - restrict to project access via workflow runs
DROP POLICY IF EXISTS "Authenticated users can view workflow steps" ON public.ai_workflow_steps;
DROP POLICY IF EXISTS "Users can view workflow steps" ON public.ai_workflow_steps;
CREATE POLICY "Users can view steps for accessible workflows"
ON public.ai_workflow_steps FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_workflow_runs wr
    WHERE wr.id = ai_workflow_steps.workflow_run_id
    AND public.user_has_project_access(auth.uid(), wr.project_id::text)
  )
  OR public.has_role(auth.uid(), 'manager'::app_role)
);