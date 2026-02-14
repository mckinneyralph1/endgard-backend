
-- =============================================
-- Feature Definitions for 8 new System Engineering modules
-- All default to enterprise tier, disabled by default
-- =============================================
INSERT INTO feature_definitions (key, name, description, tier_available, display_order, is_active) VALUES
  ('assumptions_register', 'Assumptions & Dependencies Register', 'Track and validate assumptions made during hazard analysis and system design', ARRAY['professional', 'enterprise'], 11, true),
  ('ncr_reports', 'Non-Conformance Reports', 'Capture, track, and dispose of deviations discovered during verification and validation', ARRAY['professional', 'enterprise'], 12, true),
  ('rams_targets', 'RAMS Targets', 'Quantitative reliability, availability, maintainability, and safety targets (MTBF, MTTR)', ARRAY['professional', 'enterprise'], 13, true),
  ('safety_case_gsn', 'Safety Case Arguments (GSN)', 'Goal Structuring Notation for linking safety claims to evidence', ARRAY['enterprise'], 14, true),
  ('operational_constraints', 'Operational & Maintenance Constraints', 'Post-certification conditions, inspection intervals, and operating limits', ARRAY['professional', 'enterprise'], 15, true),
  ('competency_records', 'Personnel Competency Records', 'Qualifications and credentials tracking for safety-critical personnel (ISO 17020)', ARRAY['professional', 'enterprise'], 16, true),
  ('document_register', 'Document Register & Config Baselines', 'Formal controlled document index and versioned configuration baselines', ARRAY['professional', 'enterprise'], 17, true),
  ('fracas', 'FRACAS', 'Failure Reporting, Analysis, and Corrective Action System for lifecycle management', ARRAY['enterprise'], 18, true);

-- =============================================
-- 1. Assumptions & Dependencies Register
-- =============================================
CREATE TABLE public.assumptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assumption_type TEXT NOT NULL DEFAULT 'design' CHECK (assumption_type IN ('design', 'operational', 'environmental', 'interface', 'regulatory', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'validated', 'invalidated', 'deferred')),
  source TEXT,
  owner_id UUID REFERENCES public.profiles(id),
  linked_hazard_id UUID,
  linked_requirement_id UUID,
  validation_method TEXT,
  validation_evidence TEXT,
  validated_by UUID REFERENCES public.profiles(id),
  validated_at TIMESTAMPTZ,
  risk_if_invalid TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  due_date DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view assumptions for accessible projects" ON public.assumptions FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can insert assumptions" ON public.assumptions FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can update assumptions" ON public.assumptions FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can delete assumptions" ON public.assumptions FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_assumptions_updated_at BEFORE UPDATE ON public.assumptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. Non-Conformance Reports (NCR)
-- =============================================
CREATE TABLE public.non_conformance_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  ncr_type TEXT NOT NULL DEFAULT 'minor' CHECK (ncr_type IN ('minor', 'major', 'critical', 'observation')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'dispositioned', 'closed', 'rejected')),
  disposition TEXT CHECK (disposition IN ('accept_as_is', 'rework', 'repair', 'scrap', 'return_to_supplier', 'use_as_is_with_concession')),
  disposition_rationale TEXT,
  detected_during TEXT CHECK (detected_during IN ('design_review', 'inspection', 'testing', 'audit', 'operation', 'supplier_review')),
  detected_by UUID REFERENCES public.profiles(id),
  detected_date DATE NOT NULL DEFAULT CURRENT_DATE,
  affected_item_type TEXT,
  affected_item_id TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  disposition_by UUID REFERENCES public.profiles(id),
  disposition_date DATE,
  closed_by UUID REFERENCES public.profiles(id),
  closed_date DATE,
  linked_hazard_id UUID,
  linked_requirement_id UUID,
  linked_test_case_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.non_conformance_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view NCRs for accessible projects" ON public.non_conformance_reports FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can insert NCRs" ON public.non_conformance_reports FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can update NCRs" ON public.non_conformance_reports FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can delete NCRs" ON public.non_conformance_reports FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_ncr_updated_at BEFORE UPDATE ON public.non_conformance_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3. RAMS Targets
-- =============================================
CREATE TABLE public.rams_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('reliability', 'availability', 'maintainability', 'safety')),
  metric_name TEXT NOT NULL,
  metric_unit TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  actual_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'not_measured' CHECK (status IN ('not_measured', 'on_target', 'at_risk', 'below_target', 'exceeded')),
  measurement_method TEXT,
  measurement_date DATE,
  linked_ce_id UUID,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rams_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view RAMS targets" ON public.rams_targets FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can insert RAMS targets" ON public.rams_targets FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can update RAMS targets" ON public.rams_targets FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can delete RAMS targets" ON public.rams_targets FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_rams_targets_updated_at BEFORE UPDATE ON public.rams_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 4. Safety Case Arguments (GSN)
-- =============================================
CREATE TABLE public.safety_case_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('goal', 'strategy', 'context', 'assumption', 'justification', 'solution', 'away_goal')),
  title TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.safety_case_nodes(id) ON DELETE CASCADE,
  display_order INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'undeveloped' CHECK (status IN ('undeveloped', 'developed', 'supported', 'challenged')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_case_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view safety case nodes" ON public.safety_case_nodes FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can insert safety case nodes" ON public.safety_case_nodes FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can update safety case nodes" ON public.safety_case_nodes FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Managers can delete safety case nodes" ON public.safety_case_nodes FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_safety_case_nodes_updated_at BEFORE UPDATE ON public.safety_case_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evidence links for safety case solutions
CREATE TABLE public.safety_case_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES public.safety_case_nodes(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('hazard', 'requirement', 'test_case', 'checklist_item', 'design_record', 'verification_record', 'document', 'external')),
  evidence_id TEXT,
  evidence_title TEXT NOT NULL,
  evidence_url TEXT,
  sufficiency TEXT CHECK (sufficiency IN ('sufficient', 'partial', 'insufficient', 'not_assessed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_case_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view evidence via node project" ON public.safety_case_evidence FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.safety_case_nodes n WHERE n.id = node_id AND public.user_has_project_access(auth.uid(), n.project_id))
);
CREATE POLICY "Users can insert evidence" ON public.safety_case_evidence FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.safety_case_nodes n WHERE n.id = node_id AND public.user_has_project_access(auth.uid(), n.project_id))
);
CREATE POLICY "Users can update evidence" ON public.safety_case_evidence FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.safety_case_nodes n WHERE n.id = node_id AND public.user_has_project_access(auth.uid(), n.project_id))
);
CREATE POLICY "Users can delete evidence" ON public.safety_case_evidence FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.safety_case_nodes n WHERE n.id = node_id AND public.user_has_project_access(auth.uid(), n.project_id))
);

-- =============================================
-- 5. Operational & Maintenance Constraints
-- =============================================
CREATE TABLE public.operational_constraints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  constraint_type TEXT NOT NULL DEFAULT 'operational' CHECK (constraint_type IN ('operational', 'maintenance', 'inspection', 'environmental', 'training', 'procedural')),
  source TEXT,
  linked_hazard_id UUID,
  linked_requirement_id UUID,
  frequency TEXT,
  responsible_role TEXT,
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'retired')),
  effective_date DATE,
  review_date DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_constraints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view constraints" ON public.operational_constraints FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can insert constraints" ON public.operational_constraints FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can update constraints" ON public.operational_constraints FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can delete constraints" ON public.operational_constraints FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_constraints_updated_at BEFORE UPDATE ON public.operational_constraints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 6. Personnel Competency Records
-- =============================================
CREATE TABLE public.competency_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id),
  person_name TEXT NOT NULL,
  person_role TEXT NOT NULL,
  person_organization TEXT,
  competency_type TEXT NOT NULL CHECK (competency_type IN ('qualification', 'certification', 'training', 'experience', 'assessment')),
  competency_name TEXT NOT NULL,
  issuing_body TEXT,
  credential_number TEXT,
  issued_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'pending_renewal')),
  evidence_reference TEXT,
  notes TEXT,
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.competency_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view competency records" ON public.competency_records FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can insert competency records" ON public.competency_records FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can update competency records" ON public.competency_records FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can delete competency records" ON public.competency_records FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_competency_updated_at BEFORE UPDATE ON public.competency_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 7. Document Register & Configuration Baselines
-- =============================================
CREATE TABLE public.document_register (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_number TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('plan', 'specification', 'report', 'procedure', 'drawing', 'certificate', 'standard', 'correspondence', 'other')),
  revision TEXT NOT NULL DEFAULT 'A',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'superseded', 'archived')),
  author TEXT,
  approver TEXT,
  approved_date DATE,
  storage_location TEXT,
  external_url TEXT,
  description TEXT,
  classification TEXT DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  retention_period TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view documents" ON public.document_register FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can insert documents" ON public.document_register FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can update documents" ON public.document_register FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can delete documents" ON public.document_register FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_doc_register_updated_at BEFORE UPDATE ON public.document_register FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.configuration_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  baseline_name TEXT NOT NULL,
  baseline_type TEXT NOT NULL CHECK (baseline_type IN ('functional', 'allocated', 'product', 'operational')),
  version TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'approved', 'superseded')),
  snapshot_data JSONB,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.configuration_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view baselines" ON public.configuration_baselines FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can insert baselines" ON public.configuration_baselines FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can update baselines" ON public.configuration_baselines FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can delete baselines" ON public.configuration_baselines FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_baselines_updated_at BEFORE UPDATE ON public.configuration_baselines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 8. FRACAS (Failure Reporting, Analysis, and Corrective Action System)
-- =============================================
CREATE TABLE public.failure_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  failure_mode TEXT,
  failure_category TEXT NOT NULL DEFAULT 'hardware' CHECK (failure_category IN ('hardware', 'software', 'human', 'procedural', 'environmental', 'interface', 'other')),
  severity TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('negligible', 'minor', 'major', 'critical', 'catastrophic')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'under_analysis', 'corrective_action', 'verification', 'closed')),
  reported_by UUID REFERENCES public.profiles(id),
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  occurrence_date DATE,
  location TEXT,
  linked_hazard_id UUID,
  linked_ce_id UUID,
  root_cause_analysis TEXT,
  root_cause_category TEXT CHECK (root_cause_category IN ('design', 'manufacturing', 'installation', 'maintenance', 'operation', 'supplier', 'unknown')),
  corrective_action TEXT,
  corrective_action_owner UUID REFERENCES public.profiles(id),
  corrective_action_due DATE,
  corrective_action_completed DATE,
  preventive_action TEXT,
  verification_method TEXT,
  verified_by UUID REFERENCES public.profiles(id),
  verified_date DATE,
  recurrence_count INT DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.failure_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view failure reports" ON public.failure_reports FOR SELECT USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can insert failure reports" ON public.failure_reports FOR INSERT WITH CHECK (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can update failure reports" ON public.failure_reports FOR UPDATE USING (public.user_has_project_access(auth.uid(), project_id));
CREATE POLICY "Users can delete failure reports" ON public.failure_reports FOR DELETE USING (public.user_has_project_access(auth.uid(), project_id));

CREATE TRIGGER update_failure_reports_updated_at BEFORE UPDATE ON public.failure_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
