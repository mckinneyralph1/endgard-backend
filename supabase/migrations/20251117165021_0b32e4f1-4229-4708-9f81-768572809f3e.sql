-- Update RLS policies for safety-critical tables to restrict modifications to managers

-- HAZARDS TABLE
DROP POLICY IF EXISTS "Anyone can insert hazards" ON public.hazards;
DROP POLICY IF EXISTS "Anyone can update hazards" ON public.hazards;
DROP POLICY IF EXISTS "Anyone can delete hazards" ON public.hazards;

CREATE POLICY "Managers can insert hazards" 
  ON public.hazards 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update hazards" 
  ON public.hazards 
  FOR UPDATE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete hazards" 
  ON public.hazards 
  FOR DELETE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

-- REQUIREMENTS TABLE
DROP POLICY IF EXISTS "Anyone can insert requirements" ON public.requirements;
DROP POLICY IF EXISTS "Anyone can update requirements" ON public.requirements;

CREATE POLICY "Managers can insert requirements" 
  ON public.requirements 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update requirements" 
  ON public.requirements 
  FOR UPDATE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

-- CERTIFIABLE ELEMENTS TABLE
DROP POLICY IF EXISTS "Anyone can insert certifiable elements" ON public.certifiable_elements;
DROP POLICY IF EXISTS "Anyone can update certifiable elements" ON public.certifiable_elements;

CREATE POLICY "Managers can insert certifiable elements" 
  ON public.certifiable_elements 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update certifiable elements" 
  ON public.certifiable_elements 
  FOR UPDATE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

-- TEST CASES TABLE
DROP POLICY IF EXISTS "Anyone can insert test cases" ON public.test_cases;
DROP POLICY IF EXISTS "Anyone can update test cases" ON public.test_cases;

CREATE POLICY "Managers can insert test cases" 
  ON public.test_cases 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update test cases" 
  ON public.test_cases 
  FOR UPDATE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

-- REPORT SECTIONS TABLE
DROP POLICY IF EXISTS "Anyone can insert report sections" ON public.report_sections;
DROP POLICY IF EXISTS "Anyone can update report sections" ON public.report_sections;
DROP POLICY IF EXISTS "Anyone can delete report sections" ON public.report_sections;

CREATE POLICY "Managers can insert report sections" 
  ON public.report_sections 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update report sections" 
  ON public.report_sections 
  FOR UPDATE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete report sections" 
  ON public.report_sections 
  FOR DELETE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

-- REPORT TEMPLATES TABLE
DROP POLICY IF EXISTS "Anyone can insert report templates" ON public.report_templates;
DROP POLICY IF EXISTS "Anyone can update report templates" ON public.report_templates;

CREATE POLICY "Managers can insert report templates" 
  ON public.report_templates 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update report templates" 
  ON public.report_templates 
  FOR UPDATE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));

-- CHECKLIST DOCUMENTS TABLE
DROP POLICY IF EXISTS "Anyone can insert checklist documents" ON public.checklist_documents;
DROP POLICY IF EXISTS "Anyone can delete checklist documents" ON public.checklist_documents;

CREATE POLICY "Managers can insert checklist documents" 
  ON public.checklist_documents 
  FOR INSERT 
  TO authenticated
  WITH CHECK (public.current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete checklist documents" 
  ON public.checklist_documents 
  FOR DELETE 
  TO authenticated
  USING (public.current_user_has_role('manager'::app_role));