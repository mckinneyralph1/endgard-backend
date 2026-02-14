
-- ======================================
-- Customizable Report Templates & Scheduled Reports
-- ======================================

-- 1. Reusable report section templates (custom report structures)
CREATE TABLE public.report_structure_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL DEFAULT 'custom',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_structure_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view report structure templates"
  ON public.report_structure_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can create report structure templates"
  ON public.report_structure_templates FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update report structure templates"
  ON public.report_structure_templates FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete non-default templates"
  ON public.report_structure_templates FOR DELETE
  USING (auth.uid() IS NOT NULL AND is_default = false);

CREATE TRIGGER update_report_structure_templates_updated_at
  BEFORE UPDATE ON public.report_structure_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Scheduled report generation
CREATE TABLE public.report_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  template_id UUID REFERENCES public.report_structure_templates(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'safety_case',
  schedule_name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  cron_expression TEXT NOT NULL DEFAULT '0 8 * * 1',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  output_format TEXT NOT NULL DEFAULT 'pdf',
  recipient_emails TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view report schedules"
  ON public.report_schedules FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage report schedules"
  ON public.report_schedules FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update report schedules"
  ON public.report_schedules FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete report schedules"
  ON public.report_schedules FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_report_schedules_updated_at
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Report generation log (tracks scheduled + manual runs)
CREATE TABLE public.report_generation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES public.report_schedules(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL,
  report_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  output_format TEXT NOT NULL DEFAULT 'pdf',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view generation logs"
  ON public.report_generation_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert generation logs"
  ON public.report_generation_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed default report structure templates
INSERT INTO public.report_structure_templates (name, description, template_type, is_default, sections) VALUES
(
  'Safety Case Report',
  'Standard safety case documentation structure for certification',
  'safety_case',
  true,
  '[
    {"number": "1", "title": "Executive Summary", "description": "High-level overview of the safety case, certification scope, and conclusions"},
    {"number": "2", "title": "System Description", "description": "Description of the system under certification including boundaries and interfaces"},
    {"number": "3", "title": "Safety Requirements", "description": "Derived safety requirements from hazard analysis and applicable standards"},
    {"number": "4", "title": "Hazard Analysis", "description": "Comprehensive hazard identification and risk assessment results"},
    {"number": "5", "title": "Risk Assessment", "description": "Risk evaluation methodology and residual risk acceptance rationale"},
    {"number": "6", "title": "Safety Architecture", "description": "Design features and safety mechanisms implementing the safety requirements"},
    {"number": "7", "title": "Verification & Validation", "description": "V&V activities demonstrating safety requirement compliance"},
    {"number": "8", "title": "Safety Management", "description": "Safety organization, processes, and lifecycle management approach"},
    {"number": "9", "title": "Conclusions", "description": "Final safety assessment and certification recommendation"}
  ]'::jsonb
),
(
  'Verification Report',
  'Verification and validation results documentation',
  'verification_report',
  true,
  '[
    {"number": "1", "title": "Introduction", "description": "Report purpose, scope, and references"},
    {"number": "2", "title": "Verification Objectives", "description": "V&V goals and success criteria"},
    {"number": "3", "title": "Requirements Coverage", "description": "Traceability of requirements to verification evidence"},
    {"number": "4", "title": "Test Results", "description": "Summary of all test execution results"},
    {"number": "5", "title": "Compliance Matrix", "description": "Standards compliance mapping and assessment"},
    {"number": "6", "title": "Non-Conformances", "description": "Identified non-conformances and corrective actions"},
    {"number": "7", "title": "Certification Statement", "description": "Final verification conclusion and recommendation"}
  ]'::jsonb
),
(
  'FTA Safety & Security Certification Plan',
  'SSCP structure per FTA Circular 5800.1',
  'sscp',
  true,
  '[
    {"number": "1", "title": "Introduction and Purpose", "description": "Plan purpose, scope, and relationship to agency SSO/PTASP"},
    {"number": "2", "title": "Certification Organization", "description": "SSCC structure, roles, responsibilities, and authority"},
    {"number": "3", "title": "Certification Methodology", "description": "10-step methodology from FTA Circular 5800.1"},
    {"number": "4", "title": "System Description", "description": "Detailed description of certifiable elements and boundaries"},
    {"number": "5", "title": "Applicable Standards & Regulations", "description": "Federal, state, local codes and industry standards"},
    {"number": "6", "title": "Hazard Analysis Process", "description": "OHA, PHA, CHA methodology and integration"},
    {"number": "7", "title": "Open Items List (OIL)", "description": "OIL management process and resolution tracking"},
    {"number": "8", "title": "Design Criteria Conformance", "description": "DCCC process for design-to-requirement traceability"},
    {"number": "9", "title": "Construction & Installation Conformance", "description": "CSCC process for specification-to-installation verification"},
    {"number": "10", "title": "Testing & Commissioning", "description": "Integration testing, acceptance testing, and commissioning plans"},
    {"number": "11", "title": "Operational Readiness", "description": "ORR activities, training, SOPs, and emergency preparedness"},
    {"number": "12", "title": "Safety & Security Certification Verification Report", "description": "SSC-VR requirements, sign-off, and conditional certification criteria"}
  ]'::jsonb
),
(
  'Monthly Progress Report',
  'Periodic project status report for stakeholders',
  'progress_report',
  true,
  '[
    {"number": "1", "title": "Executive Summary", "description": "Month-at-a-glance with key metrics and decisions"},
    {"number": "2", "title": "Certification Readiness", "description": "Current readiness score and trend analysis"},
    {"number": "3", "title": "Hazard Status", "description": "New, closed, and open hazards summary"},
    {"number": "4", "title": "Requirements Progress", "description": "Requirements verification and approval status"},
    {"number": "5", "title": "Test Campaign", "description": "Test execution results and coverage metrics"},
    {"number": "6", "title": "Blockers & Risks", "description": "Open blockers, risk register updates, escalations"},
    {"number": "7", "title": "Schedule & Milestones", "description": "Schedule adherence, upcoming milestones, and forecasts"},
    {"number": "8", "title": "Action Items", "description": "Action items from reviews with owners and due dates"}
  ]'::jsonb
);
