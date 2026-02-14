-- Complete remaining policy cleanup

-- 1. Drop all remaining "Anyone can view" public policies on template tables
DROP POLICY IF EXISTS "Anyone can view CE templates" ON public.ce_templates;
DROP POLICY IF EXISTS "Anyone can view ce templates" ON public.ce_templates;
DROP POLICY IF EXISTS "Anyone can view CE template items" ON public.ce_template_items;
DROP POLICY IF EXISTS "Anyone can view ce template items" ON public.ce_template_items;

DROP POLICY IF EXISTS "Anyone can view requirement templates" ON public.requirement_templates;
DROP POLICY IF EXISTS "Anyone can view requirement template items" ON public.requirement_template_items;

DROP POLICY IF EXISTS "Anyone can view phase config" ON public.checklist_phase_config;
DROP POLICY IF EXISTS "Anyone can view category config" ON public.checklist_category_config;

DROP POLICY IF EXISTS "Anyone can view page banners" ON public.page_banners;
DROP POLICY IF EXISTS "Anyone can view hidden tabs" ON public.industry_hidden_tabs;

DROP POLICY IF EXISTS "Anyone can view hazard templates" ON public.hazard_templates;
DROP POLICY IF EXISTS "Anyone can view hazard template items" ON public.hazard_template_items;

DROP POLICY IF EXISTS "Anyone can view risk matrices" ON public.risk_matrices;

-- 2. Fix compliance_validation_tasks - should use project access
DROP POLICY IF EXISTS "Anyone can view compliance validation tasks" ON public.compliance_validation_tasks;
DROP POLICY IF EXISTS "Authenticated users can view own tasks" ON public.compliance_validation_tasks;
CREATE POLICY "Users can view compliance tasks for accessible projects"
ON public.compliance_validation_tasks FOR SELECT
TO authenticated
USING (public.user_has_project_access(auth.uid(), project_id::text));

-- 3. Fix acceptance_decisions - drop old policy with 'true' condition
DO $$
BEGIN
  IF to_regclass('public.acceptance_decisions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view acceptance decisions" ON public.acceptance_decisions;
  END IF;
END $$;

-- 4. Fix requirement_validation_history - drop old policy with 'true' condition  
DO $$
BEGIN
  IF to_regclass('public.requirement_validation_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view validation history" ON public.requirement_validation_history;
  END IF;
END $$;

-- 5. Ensure requirement_templates have authenticated-only policies
CREATE POLICY "Authenticated users can view requirement templates"
ON public.requirement_templates FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view requirement template items"
ON public.requirement_template_items FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 6. Make page_banners authenticated only (marketing content still needs auth)
CREATE POLICY "Authenticated users can view page banners"
ON public.page_banners FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
