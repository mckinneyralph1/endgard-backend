-- Fix remaining security issues identified in scan

-- 1. Template tables - restrict to authenticated users only (these are library resources, not public)
DROP POLICY IF EXISTS "Anyone can view ce templates" ON public.ce_templates;
CREATE POLICY "Authenticated users can view ce templates"
ON public.ce_templates FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view ce template items" ON public.ce_template_items;
CREATE POLICY "Authenticated users can view ce template items"
ON public.ce_template_items FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view hazard templates" ON public.hazard_templates;
CREATE POLICY "Authenticated users can view hazard templates"
ON public.hazard_templates FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view hazard template items" ON public.hazard_template_items;
CREATE POLICY "Authenticated users can view hazard template items"
ON public.hazard_template_items FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view checklist category config" ON public.checklist_category_config;
CREATE POLICY "Authenticated users can view checklist category config"
ON public.checklist_category_config FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view checklist phase config" ON public.checklist_phase_config;
CREATE POLICY "Authenticated users can view checklist phase config"
ON public.checklist_phase_config FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view risk matrices" ON public.risk_matrices;
CREATE POLICY "Authenticated users can view risk matrices"
ON public.risk_matrices FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 2. Fix phase_dependencies to use project access
DROP POLICY IF EXISTS "Users can view phase dependencies" ON public.phase_dependencies;
CREATE POLICY "Users can view phase dependencies for accessible projects"
ON public.phase_dependencies FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- 3. Fix acceptance_decisions to use project access
DO $$
BEGIN
  IF to_regclass('public.acceptance_decisions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can view acceptance decisions" ON public.acceptance_decisions;
    CREATE POLICY "Users can view acceptance decisions for accessible projects"
    ON public.acceptance_decisions FOR SELECT
    TO authenticated
    USING (public.user_has_project_access(auth.uid(), project_id::text));
  END IF;
END $$;

-- 4. Fix requirement_validation_history - needs to join through requirements table
DO $$
BEGIN
  IF to_regclass('public.requirement_validation_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can view validation history" ON public.requirement_validation_history;
    CREATE POLICY "Users can view validation history for accessible projects"
    ON public.requirement_validation_history FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.requirements r
        WHERE r.id = requirement_validation_history.requirement_id
        AND public.user_has_project_access(auth.uid(), r.project_id)
      )
    );
  END IF;
END $$;

-- 5. Fix calendar_events conflicting policies - remove overly permissive one
DROP POLICY IF EXISTS "Authenticated users can view all calendar events" ON public.calendar_events;

-- 6. Fix industry_hidden_tabs - restrict to authenticated
DROP POLICY IF EXISTS "Anyone can view industry hidden tabs" ON public.industry_hidden_tabs;
CREATE POLICY "Authenticated users can view industry hidden tabs"
ON public.industry_hidden_tabs FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
