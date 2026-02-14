-- Fix RLS policies - Drop existing and recreate with proper auth checks
-- Using DROP IF EXISTS to handle any policy name variations

-- 1. certificate_signatures
DROP POLICY IF EXISTS "Authenticated users can view signatures" ON public.certificate_signatures;
DROP POLICY IF EXISTS "Anyone can view signatures" ON public.certificate_signatures;
CREATE POLICY "Authenticated users can view signatures" 
ON public.certificate_signatures FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. section_comments
DROP POLICY IF EXISTS "Authenticated users can view section comments" ON public.section_comments;
DROP POLICY IF EXISTS "Anyone can view section comments" ON public.section_comments;
CREATE POLICY "Authenticated users can view section comments" 
ON public.section_comments FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3. section_history
DROP POLICY IF EXISTS "Authenticated users can view section history" ON public.section_history;
DROP POLICY IF EXISTS "Anyone can view section history" ON public.section_history;
CREATE POLICY "Authenticated users can view section history" 
ON public.section_history FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4. stage_approvals
DROP POLICY IF EXISTS "Authenticated users can view stage approvals" ON public.stage_approvals;
DROP POLICY IF EXISTS "Anyone can view stage approvals" ON public.stage_approvals;
CREATE POLICY "Authenticated users can view stage approvals" 
ON public.stage_approvals FOR SELECT USING (auth.uid() IS NOT NULL);

-- 5. profiles
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);

-- 6. hazards
DROP POLICY IF EXISTS "Authenticated users can view hazards" ON public.hazards;
DROP POLICY IF EXISTS "Anyone can view hazards" ON public.hazards;
CREATE POLICY "Authenticated users can view hazards" 
ON public.hazards FOR SELECT USING (auth.uid() IS NOT NULL);

-- 7. requirements
DROP POLICY IF EXISTS "Authenticated users can view requirements" ON public.requirements;
DROP POLICY IF EXISTS "Anyone can view requirements" ON public.requirements;
CREATE POLICY "Authenticated users can view requirements" 
ON public.requirements FOR SELECT USING (auth.uid() IS NOT NULL);

-- 8. compliance_validations
DROP POLICY IF EXISTS "Authenticated users can view compliance validations" ON public.compliance_validations;
DROP POLICY IF EXISTS "Anyone can view compliance validations" ON public.compliance_validations;
CREATE POLICY "Authenticated users can view compliance validations" 
ON public.compliance_validations FOR SELECT USING (auth.uid() IS NOT NULL);

-- 9. report_sections
DROP POLICY IF EXISTS "Authenticated users can view report sections" ON public.report_sections;
DROP POLICY IF EXISTS "Anyone can view report sections" ON public.report_sections;
CREATE POLICY "Authenticated users can view report sections" 
ON public.report_sections FOR SELECT USING (auth.uid() IS NOT NULL);

-- 10. report_templates
DROP POLICY IF EXISTS "Authenticated users can view report templates" ON public.report_templates;
DROP POLICY IF EXISTS "Anyone can view report templates" ON public.report_templates;
CREATE POLICY "Authenticated users can view report templates" 
ON public.report_templates FOR SELECT USING (auth.uid() IS NOT NULL);

-- 11. projects
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view all projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view projects" ON public.projects;
CREATE POLICY "Authenticated users can view projects" 
ON public.projects FOR SELECT USING (auth.uid() IS NOT NULL);

-- 12. certifiable_elements
DROP POLICY IF EXISTS "Authenticated users can view certifiable elements" ON public.certifiable_elements;
DROP POLICY IF EXISTS "Anyone can view certifiable elements" ON public.certifiable_elements;
CREATE POLICY "Authenticated users can view certifiable elements" 
ON public.certifiable_elements FOR SELECT USING (auth.uid() IS NOT NULL);

-- 13. test_cases
DROP POLICY IF EXISTS "Authenticated users can view test cases" ON public.test_cases;
DROP POLICY IF EXISTS "Anyone can view test cases" ON public.test_cases;
CREATE POLICY "Authenticated users can view test cases" 
ON public.test_cases FOR SELECT USING (auth.uid() IS NOT NULL);

-- 14. checklist_items
DROP POLICY IF EXISTS "Authenticated users can view checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "Anyone can view checklist items" ON public.checklist_items;
CREATE POLICY "Authenticated users can view checklist items" 
ON public.checklist_items FOR SELECT USING (auth.uid() IS NOT NULL);

-- 15. certificates
DROP POLICY IF EXISTS "Authenticated users can view certificates" ON public.certificates;
DROP POLICY IF EXISTS "Anyone can view certificates" ON public.certificates;
CREATE POLICY "Authenticated users can view certificates" 
ON public.certificates FOR SELECT USING (auth.uid() IS NOT NULL);

-- 16. checklist_approvals
DROP POLICY IF EXISTS "Authenticated users can view checklist approvals" ON public.checklist_approvals;
DROP POLICY IF EXISTS "Anyone can view checklist approvals" ON public.checklist_approvals;
CREATE POLICY "Authenticated users can view checklist approvals" 
ON public.checklist_approvals FOR SELECT USING (auth.uid() IS NOT NULL);

-- 17. checklist_documents
DROP POLICY IF EXISTS "Authenticated users can view checklist documents" ON public.checklist_documents;
DROP POLICY IF EXISTS "Anyone can view checklist documents" ON public.checklist_documents;
CREATE POLICY "Authenticated users can view checklist documents" 
ON public.checklist_documents FOR SELECT USING (auth.uid() IS NOT NULL);