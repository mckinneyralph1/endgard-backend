-- Create RPC function for calculating project statistics efficiently
CREATE OR REPLACE FUNCTION get_project_stats(p_project_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'requirements', (
      SELECT json_build_object(
        'total', COUNT(*),
        'draft', COUNT(*) FILTER (WHERE status = 'Draft'),
        'approved', COUNT(*) FILTER (WHERE status = 'Approved'),
        'in_review', COUNT(*) FILTER (WHERE status = 'In Review')
      )
      FROM requirements
      WHERE project_id = p_project_id
    ),
    'hazards', (
      SELECT json_build_object(
        'total', COUNT(*),
        'low', COUNT(*) FILTER (WHERE risk_level = 'Low'),
        'medium', COUNT(*) FILTER (WHERE risk_level = 'Medium'),
        'high', COUNT(*) FILTER (WHERE risk_level = 'High'),
        'critical', COUNT(*) FILTER (WHERE risk_level = 'Critical')
      )
      FROM hazards
      WHERE project_id = p_project_id
    ),
    'test_cases', (
      SELECT json_build_object(
        'total', COUNT(*),
        'passed', COUNT(*) FILTER (WHERE status = 'Passed'),
        'failed', COUNT(*) FILTER (WHERE status = 'Failed'),
        'pending', COUNT(*) FILTER (WHERE status = 'Pending'),
        'not_executed', COUNT(*) FILTER (WHERE status = 'Not Executed')
      )
      FROM test_cases
      WHERE project_id = p_project_id
    ),
    'certifiable_elements', (
      SELECT json_build_object(
        'total', COUNT(*),
        'approved', COUNT(*) FILTER (WHERE status = 'Approved'),
        'in_review', COUNT(*) FILTER (WHERE status = 'In Review'),
        'draft', COUNT(*) FILTER (WHERE status = 'Draft')
      )
      FROM certifiable_elements
      WHERE project_id = p_project_id
    ),
    'open_items', json_build_object(
      'requirements', (SELECT COUNT(*) FROM requirements WHERE project_id = p_project_id AND status != 'Approved'),
      'hazards', (SELECT COUNT(*) FROM hazards WHERE project_id = p_project_id AND status != 'Closed')
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Create RPC function for getting CE stats efficiently
CREATE OR REPLACE FUNCTION get_ce_stats(p_ce_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'hazards', (
      SELECT json_build_object(
        'total', COUNT(*),
        'low', COUNT(*) FILTER (WHERE risk_level = 'Low'),
        'medium', COUNT(*) FILTER (WHERE risk_level = 'Medium'),
        'high', COUNT(*) FILTER (WHERE risk_level = 'High'),
        'critical', COUNT(*) FILTER (WHERE risk_level = 'Critical')
      )
      FROM hazards
      WHERE ce_id = p_ce_id
    ),
    'test_cases', (
      SELECT json_build_object(
        'total', COUNT(*),
        'passed', COUNT(*) FILTER (WHERE status = 'Passed'),
        'failed', COUNT(*) FILTER (WHERE status = 'Failed'),
        'pending', COUNT(*) FILTER (WHERE status = 'Pending')
      )
      FROM test_cases
      WHERE ce_id = p_ce_id
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Create RPC function for batch fetching project data
CREATE OR REPLACE FUNCTION get_project_data_batch(p_project_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'project', (SELECT row_to_json(p) FROM projects p WHERE id = p_project_id),
    'stats', get_project_stats(p_project_id),
    'certifiable_elements', (
      SELECT COALESCE(json_agg(row_to_json(ce)), '[]'::json)
      FROM certifiable_elements ce
      WHERE project_id = p_project_id
      ORDER BY display_order, created_at
    ),
    'stage_approvals', (
      SELECT COALESCE(json_agg(row_to_json(sa)), '[]'::json)
      FROM stage_approvals sa
      WHERE project_id = p_project_id
      ORDER BY submitted_date DESC
    )
  ) INTO result;
  
  RETURN result;
END;
$$;