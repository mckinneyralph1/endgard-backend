-- Drop and recreate the get_executive_dashboard_stats function
DROP FUNCTION IF EXISTS get_executive_dashboard_stats();

CREATE OR REPLACE FUNCTION get_executive_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  portfolio_summary jsonb;
  projects_data jsonb;
BEGIN
  -- Calculate portfolio summary
  WITH project_stats AS (
    SELECT 
      p.id,
      p.code,
      p.name,
      p.target_date,
      p.compliance_framework,
      p.status,
      -- Calculate readiness score based on evidence acceptance
      COALESCE(
        ROUND(
          (COUNT(CASE WHEN tc.status = 'passed' THEN 1 END)::numeric / 
           NULLIF(COUNT(tc.id), 0)::numeric) * 100
        ),
        0
      ) as readiness_score,
      COUNT(tc.id) as total_evidence,
      COUNT(CASE WHEN tc.status = 'passed' THEN 1 END) as accepted_evidence,
      -- ORCC metrics
      (SELECT COUNT(*) FROM checklist_items ci WHERE ci.project_id = p.id) as total_orcc,
      (SELECT COUNT(*) FROM checklist_items ci WHERE ci.project_id = p.id AND ci.completed = true) as completed_orcc,
      -- Blocker counts
      (SELECT COUNT(*) FROM project_blockers pb WHERE pb.project_id = p.id AND pb.status = 'open') as open_blockers,
      (SELECT COUNT(*) FROM project_blockers pb WHERE pb.project_id = p.id AND pb.status = 'open' AND pb.priority = 'critical') as critical_blockers,
      -- Velocity metrics (last 30 days)
      (SELECT COUNT(*) FROM checklist_items ci 
       WHERE ci.project_id = p.id 
         AND ci.completed = true 
         AND ci.completed_date >= NOW() - INTERVAL '30 days') as items_completed_30d,
      (SELECT COUNT(*) FROM checklist_items ci 
       WHERE ci.project_id = p.id 
         AND ci.completed = false) as remaining_items
    FROM projects p
    LEFT JOIN test_cases tc ON tc.project_id = p.id
    GROUP BY p.id
  )
  SELECT jsonb_build_object(
    'total_projects', COUNT(*),
    'on_track_count', COUNT(CASE WHEN readiness_score >= 80 THEN 1 END),
    'at_risk_count', COUNT(CASE WHEN readiness_score >= 50 AND readiness_score < 80 THEN 1 END),
    'critical_count', COUNT(CASE WHEN readiness_score < 50 THEN 1 END),
    'average_readiness', COALESCE(ROUND(AVG(readiness_score)), 0),
    'total_open_blockers', COALESCE(SUM(open_blockers), 0)
  )
  INTO portfolio_summary
  FROM project_stats;

  -- Get individual project data
  WITH project_stats AS (
    SELECT 
      p.id,
      p.code,
      p.name,
      p.target_date,
      p.compliance_framework,
      p.status,
      -- Calculate readiness score based on evidence acceptance
      COALESCE(
        ROUND(
          (COUNT(CASE WHEN tc.status = 'passed' THEN 1 END)::numeric / 
           NULLIF(COUNT(tc.id), 0)::numeric) * 100
        ),
        0
      ) as readiness_score,
      COUNT(tc.id) as total_evidence,
      COUNT(CASE WHEN tc.status = 'passed' THEN 1 END) as accepted_evidence,
      -- ORCC metrics
      (SELECT COUNT(*) FROM checklist_items ci WHERE ci.project_id = p.id) as total_orcc,
      (SELECT COUNT(*) FROM checklist_items ci WHERE ci.project_id = p.id AND ci.completed = true) as completed_orcc,
      -- Blocker counts
      (SELECT COUNT(*) FROM project_blockers pb WHERE pb.project_id = p.id AND pb.status = 'open') as open_blockers,
      (SELECT COUNT(*) FROM project_blockers pb WHERE pb.project_id = p.id AND pb.status = 'open' AND pb.priority = 'critical') as critical_blockers,
      -- Velocity metrics
      (SELECT COUNT(*) FROM checklist_items ci 
       WHERE ci.project_id = p.id 
         AND ci.completed = true 
         AND ci.completed_date >= NOW() - INTERVAL '30 days') as items_completed_30d,
      (SELECT COUNT(*) FROM checklist_items ci 
       WHERE ci.project_id = p.id 
         AND ci.completed = false) as remaining_items
    FROM projects p
    LEFT JOIN test_cases tc ON tc.project_id = p.id
    GROUP BY p.id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'code', code,
      'name', name,
      'target_date', target_date,
      'compliance_framework', compliance_framework,
      'status', status,
      'industry_name', NULL,
      'readiness_score', readiness_score,
      'total_evidence', total_evidence,
      'accepted_evidence', accepted_evidence,
      'total_orcc', total_orcc,
      'completed_orcc', completed_orcc,
      'open_blockers', open_blockers,
      'critical_blockers', critical_blockers,
      'items_completed_30d', items_completed_30d,
      'remaining_items', remaining_items
    )
    ORDER BY name
  )
  INTO projects_data
  FROM project_stats;

  -- Build final result
  result := jsonb_build_object(
    'portfolio_summary', portfolio_summary,
    'projects', COALESCE(projects_data, '[]'::jsonb)
  );

  RETURN result;
END;
$$;