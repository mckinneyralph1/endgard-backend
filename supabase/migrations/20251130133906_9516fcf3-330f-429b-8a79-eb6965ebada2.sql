-- Create standards library tables with hierarchical structure
CREATE TABLE IF NOT EXISTS public.standards_library_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.standards_library_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_id UUID NOT NULL REFERENCES public.standards_library_industries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.standards_library_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.standards_library_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  issuing_body TEXT,
  version TEXT,
  effective_date DATE,
  status TEXT DEFAULT 'active',
  external_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.standards_library_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id UUID NOT NULL REFERENCES public.standards_library_standards(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.standards_library_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standards_library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standards_library_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standards_library_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Everyone can view
CREATE POLICY "Anyone can view standards industries"
  ON public.standards_library_industries FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view standards categories"
  ON public.standards_library_categories FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view standards"
  ON public.standards_library_standards FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view standards documents"
  ON public.standards_library_documents FOR SELECT
  USING (true);

-- Managers can insert/update/delete
CREATE POLICY "Managers can insert standards industries"
  ON public.standards_library_industries FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update standards industries"
  ON public.standards_library_industries FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete standards industries"
  ON public.standards_library_industries FOR DELETE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can insert standards categories"
  ON public.standards_library_categories FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update standards categories"
  ON public.standards_library_categories FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete standards categories"
  ON public.standards_library_categories FOR DELETE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can insert standards"
  ON public.standards_library_standards FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update standards"
  ON public.standards_library_standards FOR UPDATE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete standards"
  ON public.standards_library_standards FOR DELETE
  USING (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can insert standards documents"
  ON public.standards_library_documents FOR INSERT
  WITH CHECK (current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete standards documents"
  ON public.standards_library_documents FOR DELETE
  USING (current_user_has_role('manager'::app_role));

-- Create storage bucket for standards documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('standards-documents', 'standards-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for standards documents
CREATE POLICY "Anyone can view standards documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'standards-documents');

CREATE POLICY "Managers can upload standards documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'standards-documents' AND current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can update standards documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'standards-documents' AND current_user_has_role('manager'::app_role));

CREATE POLICY "Managers can delete standards documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'standards-documents' AND current_user_has_role('manager'::app_role));

-- Seed data: Industries
INSERT INTO public.standards_library_industries (name, description, display_order) VALUES
('Rail & Bus Transit', 'Standards for rail transit systems, light rail, heavy rail, commuter rail, and bus rapid transit', 1),
('Aviation & eVTOL', 'Standards for conventional aviation, urban air mobility, and electric vertical takeoff and landing aircraft', 2),
('Maritime & Shipping', 'Standards for maritime vessels, port facilities, and shipping operations', 3),
('Road & Highway', 'Standards for roadway infrastructure, traffic systems, and highway safety', 4);

-- Seed data: Categories for Rail & Bus Transit
INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Vehicles & Rolling Stock', 'Standards for rail vehicles, buses, and rolling stock equipment', 1
FROM public.standards_library_industries WHERE name = 'Rail & Bus Transit';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Infrastructure & Facilities', 'Standards for tracks, stations, yards, maintenance facilities, and supporting infrastructure', 2
FROM public.standards_library_industries WHERE name = 'Rail & Bus Transit';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Procedures & Operations', 'Standards for operating procedures, maintenance practices, and safety management', 3
FROM public.standards_library_industries WHERE name = 'Rail & Bus Transit';

-- Seed data: Categories for Aviation & eVTOL
INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Aircraft & Equipment', 'Standards for aircraft, eVTOL vehicles, and aviation equipment', 1
FROM public.standards_library_industries WHERE name = 'Aviation & eVTOL';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Vertiports & Infrastructure', 'Standards for vertiports, helipads, airports, and aviation infrastructure', 2
FROM public.standards_library_industries WHERE name = 'Aviation & eVTOL';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Operations & Maintenance', 'Standards for flight operations, maintenance procedures, and air traffic management', 3
FROM public.standards_library_industries WHERE name = 'Aviation & eVTOL';

-- Seed data: Categories for Maritime & Shipping
INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Vessels & Equipment', 'Standards for ships, boats, and maritime equipment', 1
FROM public.standards_library_industries WHERE name = 'Maritime & Shipping';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Port Infrastructure & Facilities', 'Standards for ports, harbors, terminals, and maritime facilities', 2
FROM public.standards_library_industries WHERE name = 'Maritime & Shipping';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Operations & Maintenance', 'Standards for maritime operations, vessel maintenance, and safety management', 3
FROM public.standards_library_industries WHERE name = 'Maritime & Shipping';

-- Seed data: Categories for Road & Highway
INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Vehicles & Equipment', 'Standards for road vehicles, traffic equipment, and transportation devices', 1
FROM public.standards_library_industries WHERE name = 'Road & Highway';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Infrastructure & Facilities', 'Standards for roadways, bridges, tunnels, and highway infrastructure', 2
FROM public.standards_library_industries WHERE name = 'Road & Highway';

INSERT INTO public.standards_library_categories (industry_id, name, description, display_order)
SELECT id, 'Operations & Maintenance', 'Standards for traffic operations, road maintenance, and safety procedures', 3
FROM public.standards_library_industries WHERE name = 'Road & Highway';

-- Seed data: Rail & Bus Transit Standards
INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'FTA-5046', 'Safety and Security Management', 'Federal Transit Administration guidelines for safety and security management in public transportation', 'Federal Transit Administration (FTA)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Rail & Bus Transit' AND c.name = 'Procedures & Operations';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'APTA RT-VIM', 'Rail Vehicle Inspection and Maintenance', 'Standards for inspection and maintenance of rail transit vehicles', 'American Public Transportation Association (APTA)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Rail & Bus Transit' AND c.name = 'Vehicles & Rolling Stock';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'APTA RT-OP-S-003-02', 'Safe Operations in Yards and Maintenance Facilities', 'Requirements for safe operations of trains and on-track equipment in rail yards and maintenance facilities', 'American Public Transportation Association (APTA)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Rail & Bus Transit' AND c.name = 'Infrastructure & Facilities';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'EN 50126', 'Railway Applications - Specification and Demonstration of Reliability, Availability, Maintainability and Safety (RAMS)', 'European standard for RAMS in railway applications', 'European Committee for Electrotechnical Standardization (CENELEC)', 2
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Rail & Bus Transit' AND c.name = 'Procedures & Operations';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'EN 50129', 'Railway Applications - Communication, Signalling and Processing Systems - Safety Related Electronic Systems for Signalling', 'European standard for safety-related electronic systems in railway signalling', 'European Committee for Electrotechnical Standardization (CENELEC)', 3
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Rail & Bus Transit' AND c.name = 'Infrastructure & Facilities';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'APTA PRESS', 'Passenger Rail Equipment Safety Standards', 'Standards for commuter, intercity, and high-speed rail equipment safety', 'American Public Transportation Association (APTA)', 2
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Rail & Bus Transit' AND c.name = 'Vehicles & Rolling Stock';

-- Seed data: Aviation & eVTOL Standards
INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'FAA-AC-150-5390-2C', 'Heliport Design Advisory Circular', 'Federal Aviation Administration design standards for heliports', 'Federal Aviation Administration (FAA)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Aviation & eVTOL' AND c.name = 'Vertiports & Infrastructure';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'EASA SC-VTOL', 'Special Condition for VTOL Aircraft', 'European Aviation Safety Agency certification standards for vertical takeoff and landing aircraft', 'European Union Aviation Safety Agency (EASA)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Aviation & eVTOL' AND c.name = 'Aircraft & Equipment';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'FAA Part 135', 'Operating Requirements: Commuter and On Demand Operations', 'Federal regulations for commuter and on-demand air carrier operations', 'Federal Aviation Administration (FAA)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Aviation & eVTOL' AND c.name = 'Operations & Maintenance';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'ICAO Annex 14', 'Aerodromes - Design and Operations', 'International standards for aerodrome design and operations', 'International Civil Aviation Organization (ICAO)', 2
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Aviation & eVTOL' AND c.name = 'Vertiports & Infrastructure';

-- Seed data: Maritime & Shipping Standards
INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'IMO SOLAS', 'International Convention for the Safety of Life at Sea', 'Most important international treaty concerning maritime safety', 'International Maritime Organization (IMO)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Maritime & Shipping' AND c.name = 'Vessels & Equipment';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'IMO ISM Code', 'International Safety Management Code', 'International standard for safe management and operation of ships', 'International Maritime Organization (IMO)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Maritime & Shipping' AND c.name = 'Operations & Maintenance';

INSERT INTO public.standards_library_standards (category_id, code, name, description, issuing_body, display_order)
SELECT c.id, 'IMO ISPS Code', 'International Ship and Port Facility Security Code', 'Comprehensive security regime for ships and port facilities', 'International Maritime Organization (IMO)', 1
FROM public.standards_library_categories c
JOIN public.standards_library_industries i ON c.industry_id = i.id
WHERE i.name = 'Maritime & Shipping' AND c.name = 'Port Infrastructure & Facilities';

-- Create indexes for performance
CREATE INDEX idx_standards_library_categories_industry ON public.standards_library_categories(industry_id);
CREATE INDEX idx_standards_library_standards_category ON public.standards_library_standards(category_id);
CREATE INDEX idx_standards_library_documents_standard ON public.standards_library_documents(standard_id);