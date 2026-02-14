-- Create RPC function for executive dashboard stats
CREATE OR REPLACE FUNCTION public.get_executive_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'portfolio_summary', (
      SELECT json_build_object(
        'total_projects', COUNT(*),
        'on_track_count', COUNT(*) FILTER (WHERE readiness >= 80),
        'at_risk_count', COUNT(*) FILTER (WHERE readiness >= 50 AND readiness < 80),
        'critical_count', COUNT(*) FILTER (WHERE readiness < 50),
        'average_readiness', ROUND(COALESCE(AVG(readiness), 0))
      )
      FROM (
        SELECT p.id,
          CASE 
            WHEN (
              SELECT COUNT(*) FROM design_records WHERE project_id = p.id
            ) = 0 THEN 0
            ELSE ROUND(
              (
                -- Evidence accepted (design records with acceptance_status = 'accepted')
                (SELECT COUNT(*) FILTER (WHERE acceptance_status = 'accepted') FROM design_records WHERE project_id = p.id)::NUMERIC /
                GREATEST((SELECT COUNT(*) FROM design_records WHERE project_id = p.id), 1)::NUMERIC * 50
              ) + (
                -- ORCC completed (checklist items with category containing 'orcc' or 'operations')
                (SELECT COUNT(*) FILTER (WHERE completed = true AND (LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%')) FROM checklist_items WHERE project_id = p.id)::NUMERIC /
                GREATEST((SELECT COUNT(*) FILTER (WHERE LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%') FROM checklist_items WHERE project_id = p.id), 1)::NUMERIC * 50
              )
            )
          END as readiness
        FROM projects p
        WHERE p.is_archived = false
      ) project_readiness
    ),
    'projects', (
      SELECT COALESCE(json_agg(project_data ORDER BY readiness_score DESC), '[]'::json)
      FROM (
        SELECT 
          p.id,
          p.code,
          p.name,
          p.target_date,
          p.compliance_framework,
          sli.name as industry_name,
          -- Calculate readiness score
          CASE 
            WHEN (SELECT COUNT(*) FROM design_records WHERE project_id = p.id) = 0 
                 AND (SELECT COUNT(*) FILTER (WHERE LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%') FROM checklist_items WHERE project_id = p.id) = 0
            THEN 0
            ELSE ROUND(
              COALESCE(
                (SELECT COUNT(*) FILTER (WHERE acceptance_status = 'accepted') FROM design_records WHERE project_id = p.id)::NUMERIC /
                GREATEST((SELECT COUNT(*) FROM design_records WHERE project_id = p.id), 1)::NUMERIC * 50, 0
              ) + COALESCE(
                (SELECT COUNT(*) FILTER (WHERE completed = true AND (LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%')) FROM checklist_items WHERE project_id = p.id)::NUMERIC /
                GREATEST((SELECT COUNT(*) FILTER (WHERE LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%') FROM checklist_items WHERE project_id = p.id), 1)::NUMERIC * 50, 0
              )
            )
          END as readiness_score,
          -- Evidence stats
          (SELECT COUNT(*) FROM design_records WHERE project_id = p.id) as total_evidence,
          (SELECT COUNT(*) FILTER (WHERE acceptance_status = 'accepted') FROM design_records WHERE project_id = p.id) as accepted_evidence,
          -- ORCC stats
          (SELECT COUNT(*) FILTER (WHERE LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%') FROM checklist_items WHERE project_id = p.id) as total_orcc,
          (SELECT COUNT(*) FILTER (WHERE completed = true AND (LOWER(category) LIKE '%orcc%' OR LOWER(category) LIKE '%operation%')) FROM checklist_items WHERE project_id = p.id) as completed_orcc,
          -- Velocity calculation (completed items in last 30 days)
          (
            SELECT COUNT(*) 
            FROM checklist_items 
            WHERE project_id = p.id 
              AND completed = true 
              AND completed_date >= (now() - interval '30 days')
          ) as items_completed_30d,
          -- Remaining items
          (
            SELECT COUNT(*) FILTER (WHERE completed = false)
            FROM checklist_items 
            WHERE project_id = p.id
          ) as remaining_items
        FROM projects p
        LEFT JOIN standards_library_industries sli ON p.industry_id = sli.id
        WHERE p.is_archived = false
      ) project_data
    )
  ) INTO result;
  
  RETURN result;
END;
$function$;