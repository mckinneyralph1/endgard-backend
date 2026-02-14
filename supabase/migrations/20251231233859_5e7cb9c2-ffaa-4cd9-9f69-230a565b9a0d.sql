-- Performance indexes for common queries
-- Index for hazards by project and status
CREATE INDEX IF NOT EXISTS idx_hazards_project_status ON public.hazards(project_id, status);
CREATE INDEX IF NOT EXISTS idx_hazards_project_risk ON public.hazards(project_id, risk_level);

-- Index for requirements by project and status  
CREATE INDEX IF NOT EXISTS idx_requirements_project_status ON public.requirements(project_id, status);

-- Index for test_cases by project and status
CREATE INDEX IF NOT EXISTS idx_test_cases_project_status ON public.test_cases(project_id, status);

-- Index for checklist_items by project and completion
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_completed ON public.checklist_items(project_id, completed);
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_category ON public.checklist_items(project_id, category);

-- Index for certifiable_elements by project
CREATE INDEX IF NOT EXISTS idx_ce_project_status ON public.certifiable_elements(project_id, status);

-- Index for workflow notifications by user
CREATE INDEX IF NOT EXISTS idx_workflow_notifications_user_read ON public.workflow_notifications(user_id, read_at);

-- Index for agent_analysis_runs by project
CREATE INDEX IF NOT EXISTS idx_agent_runs_project_status ON public.agent_analysis_runs(project_id, status);