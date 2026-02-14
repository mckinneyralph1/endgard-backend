-- Planning Structured Data Tables
-- Stores structured information for the Planning tab hybrid approach

-- System Definition Table
CREATE TABLE public.system_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Core system definition fields
  system_name TEXT NOT NULL,
  system_description TEXT,
  scope_statement TEXT,
  system_boundaries TEXT,
  excluded_items TEXT,
  
  -- Architecture
  architecture_overview TEXT,
  architecture_diagram_url TEXT,
  
  -- Operating environment
  operating_environment TEXT,
  temperature_range TEXT,
  environmental_conditions TEXT,
  
  -- Safety objectives
  safety_objectives TEXT,
  tolerable_hazard_rate TEXT,
  target_sil TEXT,
  
  -- Concept of operations
  concept_of_operations TEXT,
  normal_operations TEXT,
  degraded_modes TEXT,
  emergency_procedures TEXT,
  
  -- Assumptions and constraints
  assumptions TEXT,
  constraints TEXT,
  
  -- Metadata
  status TEXT NOT NULL DEFAULT 'draft',
  version TEXT DEFAULT '1.0',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System Interfaces Table
CREATE TABLE public.system_interfaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_definition_id UUID REFERENCES public.system_definitions(id) ON DELETE SET NULL,
  
  -- Interface details
  interface_name TEXT NOT NULL,
  interface_type TEXT NOT NULL,
  connected_system TEXT NOT NULL,
  description TEXT,
  
  -- Protocol and data
  protocol TEXT,
  data_format TEXT,
  data_flow_direction TEXT,
  
  -- Safety relevance
  is_safety_critical BOOLEAN DEFAULT false,
  failure_mode TEXT,
  
  -- Documentation
  icd_reference TEXT,
  source_document_id UUID REFERENCES public.standards_library_documents(id),
  
  -- Metadata
  status TEXT NOT NULL DEFAULT 'identified',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Stakeholder Registry Table
CREATE TABLE public.project_stakeholders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Stakeholder details
  stakeholder_name TEXT NOT NULL,
  organization TEXT,
  role TEXT NOT NULL,
  
  -- Responsibilities
  safety_responsibilities TEXT,
  approval_authority BOOLEAN DEFAULT false,
  
  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Applicable Standards Selection Table (links library standards to project)
CREATE TABLE public.project_applicable_standards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  standard_document_id UUID NOT NULL REFERENCES public.standards_library_documents(id) ON DELETE CASCADE,
  
  -- Applicability details
  applicability_rationale TEXT,
  applicable_sections TEXT,
  compliance_approach TEXT,
  tailoring_notes TEXT,
  
  -- Metadata
  added_by UUID REFERENCES public.profiles(id),
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(project_id, standard_document_id)
);

-- Enable Row Level Security
ALTER TABLE public.system_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_applicable_standards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for system_definitions
CREATE POLICY "Users can view system definitions for their projects" 
ON public.system_definitions FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_definitions.project_id 
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Managers can insert system definitions" 
ON public.system_definitions FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_definitions.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can update system definitions" 
ON public.system_definitions FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_definitions.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can delete system definitions" 
ON public.system_definitions FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_definitions.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager')
  )
);

-- RLS Policies for system_interfaces
CREATE POLICY "Users can view interfaces for their projects" 
ON public.system_interfaces FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_interfaces.project_id 
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Managers can insert interfaces" 
ON public.system_interfaces FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_interfaces.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can update interfaces" 
ON public.system_interfaces FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_interfaces.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can delete interfaces" 
ON public.system_interfaces FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = system_interfaces.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager')
  )
);

-- RLS Policies for project_stakeholders
CREATE POLICY "Users can view stakeholders for their projects" 
ON public.project_stakeholders FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_stakeholders.project_id 
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Managers can insert stakeholders" 
ON public.project_stakeholders FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_stakeholders.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can update stakeholders" 
ON public.project_stakeholders FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_stakeholders.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can delete stakeholders" 
ON public.project_stakeholders FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_stakeholders.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager')
  )
);

-- RLS Policies for project_applicable_standards
CREATE POLICY "Users can view applicable standards for their projects" 
ON public.project_applicable_standards FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_applicable_standards.project_id 
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Managers can insert applicable standards" 
ON public.project_applicable_standards FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_applicable_standards.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can update applicable standards" 
ON public.project_applicable_standards FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_applicable_standards.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager', 'contributor')
  )
);

CREATE POLICY "Managers can delete applicable standards" 
ON public.project_applicable_standards FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm 
    WHERE pm.project_id = project_applicable_standards.project_id 
    AND pm.user_id = auth.uid()
    AND pm.role IN ('owner', 'manager')
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_system_definitions_updated_at
BEFORE UPDATE ON public.system_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_interfaces_updated_at
BEFORE UPDATE ON public.system_interfaces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_stakeholders_updated_at
BEFORE UPDATE ON public.project_stakeholders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add link from checklist_items to structured planning data
ALTER TABLE public.checklist_items 
ADD COLUMN linked_planning_data_type TEXT,
ADD COLUMN linked_planning_data_id UUID;