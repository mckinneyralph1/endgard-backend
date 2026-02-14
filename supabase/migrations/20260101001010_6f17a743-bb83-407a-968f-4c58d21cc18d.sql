-- Performance optimization indexes for frequently queried columns

-- Activity log indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_activity_log_project_created 
ON public.activity_log(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity_type 
ON public.activity_log(project_id, entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity_id 
ON public.activity_log(project_id, entity_id);

-- Requirements indexes
CREATE INDEX IF NOT EXISTS idx_requirements_project_status 
ON public.requirements(project_id, status);

CREATE INDEX IF NOT EXISTS idx_requirements_project_created 
ON public.requirements(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requirements_ce_id 
ON public.requirements(ce_id) WHERE ce_id IS NOT NULL;

-- Hazards indexes
CREATE INDEX IF NOT EXISTS idx_hazards_project_risk 
ON public.hazards(project_id, risk_level);

CREATE INDEX IF NOT EXISTS idx_hazards_project_status 
ON public.hazards(project_id, status);

CREATE INDEX IF NOT EXISTS idx_hazards_ce_id 
ON public.hazards(ce_id) WHERE ce_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hazards_requirement_id 
ON public.hazards(requirement_id) WHERE requirement_id IS NOT NULL;

-- Test cases indexes
CREATE INDEX IF NOT EXISTS idx_test_cases_project_status 
ON public.test_cases(project_id, status);

CREATE INDEX IF NOT EXISTS idx_test_cases_ce_id 
ON public.test_cases(ce_id) WHERE ce_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_test_cases_requirement_id 
ON public.test_cases(requirement_id) WHERE requirement_id IS NOT NULL;

-- Certifiable elements indexes
CREATE INDEX IF NOT EXISTS idx_certifiable_elements_project_status 
ON public.certifiable_elements(project_id, status);

CREATE INDEX IF NOT EXISTS idx_certifiable_elements_parent 
ON public.certifiable_elements(parent_id) WHERE parent_id IS NOT NULL;

-- Checklist items indexes
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_category 
ON public.checklist_items(project_id, category);

CREATE INDEX IF NOT EXISTS idx_checklist_items_project_completed 
ON public.checklist_items(project_id, completed);

CREATE INDEX IF NOT EXISTS idx_checklist_items_phase 
ON public.checklist_items(project_id, phase_id) WHERE phase_id IS NOT NULL;

-- Workflow indexes
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_project_status 
ON public.ai_workflow_runs(project_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_steps_run_status 
ON public.ai_workflow_steps(workflow_run_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_artifacts_step 
ON public.ai_workflow_artifacts(workflow_step_id, status);

-- Calendar events indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_date 
ON public.calendar_events(project_id, start_date);

-- Project members indexes
CREATE INDEX IF NOT EXISTS idx_project_members_user 
ON public.project_members(user_id);

-- Design records indexes
CREATE INDEX IF NOT EXISTS idx_design_records_project 
ON public.design_records(project_id);

CREATE INDEX IF NOT EXISTS idx_design_records_requirement 
ON public.design_records(requirement_id) WHERE requirement_id IS NOT NULL;

-- Verification records indexes
CREATE INDEX IF NOT EXISTS idx_verification_records_project 
ON public.verification_records(project_id);

-- Blockers indexes
CREATE INDEX IF NOT EXISTS idx_project_blockers_project_status 
ON public.project_blockers(project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_blockers_phase 
ON public.project_blockers(phase_id) WHERE phase_id IS NOT NULL;