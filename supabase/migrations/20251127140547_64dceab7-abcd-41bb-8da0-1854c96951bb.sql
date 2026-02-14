-- Add indexes for frequently accessed columns to optimize query performance

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

-- Requirements table indexes
CREATE INDEX IF NOT EXISTS idx_requirements_project_id ON public.requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_requirements_status ON public.requirements(status);
CREATE INDEX IF NOT EXISTS idx_requirements_project_status ON public.requirements(project_id, status);
CREATE INDEX IF NOT EXISTS idx_requirements_created_at ON public.requirements(created_at DESC);

-- Hazards table indexes
CREATE INDEX IF NOT EXISTS idx_hazards_project_id ON public.hazards(project_id);
CREATE INDEX IF NOT EXISTS idx_hazards_status ON public.hazards(status);
CREATE INDEX IF NOT EXISTS idx_hazards_project_status ON public.hazards(project_id, status);
CREATE INDEX IF NOT EXISTS idx_hazards_ce_id ON public.hazards(ce_id);
CREATE INDEX IF NOT EXISTS idx_hazards_requirement_id ON public.hazards(requirement_id);
CREATE INDEX IF NOT EXISTS idx_hazards_created_at ON public.hazards(created_at DESC);

-- Test cases table indexes
CREATE INDEX IF NOT EXISTS idx_test_cases_project_id ON public.test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_status ON public.test_cases(status);
CREATE INDEX IF NOT EXISTS idx_test_cases_project_status ON public.test_cases(project_id, status);
CREATE INDEX IF NOT EXISTS idx_test_cases_test_type ON public.test_cases(test_type);
CREATE INDEX IF NOT EXISTS idx_test_cases_requirement_id ON public.test_cases(requirement_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_hazard_id ON public.test_cases(hazard_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_ce_id ON public.test_cases(ce_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_created_at ON public.test_cases(created_at DESC);

-- Certifiable elements table indexes
CREATE INDEX IF NOT EXISTS idx_certifiable_elements_project_id ON public.certifiable_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_certifiable_elements_parent_id ON public.certifiable_elements(parent_id);
CREATE INDEX IF NOT EXISTS idx_certifiable_elements_status ON public.certifiable_elements(status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'certifiable_elements'
      AND column_name = 'display_order'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_certifiable_elements_display_order ON public.certifiable_elements(display_order)';
  END IF;
END $$;

-- Checklist items table indexes
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_id ON public.checklist_items(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_category ON public.checklist_items(category);
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_category ON public.checklist_items(project_id, category);
CREATE INDEX IF NOT EXISTS idx_checklist_items_completed ON public.checklist_items(completed);
CREATE INDEX IF NOT EXISTS idx_checklist_items_hazard_id ON public.checklist_items(hazard_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_requirement_id ON public.checklist_items(requirement_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checklist_items'
      AND column_name = 'display_order'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_checklist_items_display_order ON public.checklist_items(display_order)';
  END IF;
END $$;

-- Checklist approvals table indexes
CREATE INDEX IF NOT EXISTS idx_checklist_approvals_project_id ON public.checklist_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_approvals_status ON public.checklist_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_checklist_approvals_submitted_date ON public.checklist_approvals(submitted_date DESC);

-- Stage approvals table indexes
CREATE INDEX IF NOT EXISTS idx_stage_approvals_project_id ON public.stage_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_stage_approvals_status ON public.stage_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_stage_approvals_stage ON public.stage_approvals(stage);
CREATE INDEX IF NOT EXISTS idx_stage_approvals_submitted_date ON public.stage_approvals(submitted_date DESC);

-- Report templates table indexes
CREATE INDEX IF NOT EXISTS idx_report_templates_project_id ON public.report_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_status ON public.report_templates(status);
CREATE INDEX IF NOT EXISTS idx_report_templates_template_type ON public.report_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_report_templates_created_at ON public.report_templates(created_at DESC);

-- Report sections table indexes
CREATE INDEX IF NOT EXISTS idx_report_sections_report_id ON public.report_sections(report_id);
CREATE INDEX IF NOT EXISTS idx_report_sections_status ON public.report_sections(status);
CREATE INDEX IF NOT EXISTS idx_report_sections_section_number ON public.report_sections(section_number);

-- Section comments table indexes
CREATE INDEX IF NOT EXISTS idx_section_comments_section_id ON public.section_comments(section_id);
CREATE INDEX IF NOT EXISTS idx_section_comments_user_id ON public.section_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_section_comments_created_at ON public.section_comments(created_at DESC);

-- Section history table indexes
CREATE INDEX IF NOT EXISTS idx_section_history_section_id ON public.section_history(section_id);
CREATE INDEX IF NOT EXISTS idx_section_history_user_id ON public.section_history(user_id);
CREATE INDEX IF NOT EXISTS idx_section_history_created_at ON public.section_history(created_at DESC);

-- Certificates table indexes
CREATE INDEX IF NOT EXISTS idx_certificates_project_id ON public.certificates(project_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON public.certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- Certificate signatures table indexes
CREATE INDEX IF NOT EXISTS idx_certificate_signatures_certificate_id ON public.certificate_signatures(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificate_signatures_signed_at ON public.certificate_signatures(signed_at DESC);

-- Page banners table indexes
CREATE INDEX IF NOT EXISTS idx_page_banners_page_key ON public.page_banners(page_key);

-- User roles table indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- User permissions table indexes
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON public.user_permissions(permission);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_requirements_project_priority ON public.requirements(project_id, priority);
CREATE INDEX IF NOT EXISTS idx_hazards_project_risk ON public.hazards(project_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_test_cases_project_type_status ON public.test_cases(project_id, test_type, status);
