import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resilience configuration
const CONFIG = {
  DB_TIMEOUT_MS: 30000,
  MAX_PROJECTS_PER_RUN: 50,
};

// Performance monitoring
class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  checkpoint(name: string): void {
    this.checkpoints.set(name, Date.now() - this.startTime);
  }

  getSummary(): Record<string, number> {
    return Object.fromEntries(this.checkpoints);
  }
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface ProjectStats {
  requirements: { total: number; draft: number; approved: number; in_review: number };
  hazards: { total: number; low: number; medium: number; high: number; critical: number };
  test_cases: { total: number; passed: number; failed: number; pending: number; not_executed: number };
  certifiable_elements: { total: number; approved: number; in_review: number; draft: number };
  open_items: { requirements: number; hazards: number };
  readiness_score: { score: number };
}

interface AnalysisResult {
  readinessScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  issues: Array<{ type: string; severity: string; message: string; actionable: boolean }>;
  recommendations: Array<{ priority: number; action: string; impact: string; effort: string }>;
  nextSteps: Array<{ step: number; action: string; deadline?: string }>;
  blockerCount: number;
}

async function analyzeProject(supabase: any, projectId: string): Promise<AnalysisResult> {
  console.log(`Analyzing project: ${projectId}`);
  
  // Fetch project stats using RPC
  const { data: stats, error: statsError } = await supabase.rpc('get_project_stats', { p_project_id: projectId });
  
  if (statsError) {
    console.error('Error fetching project stats:', statsError);
    throw new Error(`Failed to fetch project stats: ${statsError.message}`);
  }

  // Fetch project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*, primary_industry_id, compliance_framework')
    .eq('id', projectId)
    .single();

  if (projectError) {
    console.error('Error fetching project:', projectError);
    throw new Error(`Failed to fetch project: ${projectError.message}`);
  }

  // Fetch active blockers
  const { data: blockers } = await supabase
    .from('project_blockers')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'open');

  const blockerCount = blockers?.length || 0;

  // Fetch milestones approaching deadline
  const { data: milestones } = await supabase
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['not_started', 'in_progress'])
    .order('target_date', { ascending: true });

  // Analyze and generate insights
  const issues: AnalysisResult['issues'] = [];
  const recommendations: AnalysisResult['recommendations'] = [];
  const nextSteps: AnalysisResult['nextSteps'] = [];

  const projectStats = stats as ProjectStats;
  const readinessScore = projectStats?.readiness_score?.score || 0;

  // Determine risk level based on readiness score
  let riskLevel: AnalysisResult['riskLevel'] = 'low';
  if (readinessScore < 30) riskLevel = 'critical';
  else if (readinessScore < 50) riskLevel = 'high';
  else if (readinessScore < 80) riskLevel = 'medium';

  // Check for critical hazards without mitigation
  const criticalHazards = projectStats?.hazards?.critical || 0;
  const highHazards = projectStats?.hazards?.high || 0;
  const openHazards = projectStats?.open_items?.hazards || 0;

  if (criticalHazards > 0 || highHazards > 3) {
    issues.push({
      type: 'hazard_risk',
      severity: 'critical',
      message: `${criticalHazards} critical and ${highHazards} high-risk hazards require immediate attention`,
      actionable: true
    });
    recommendations.push({
      priority: 1,
      action: 'Review and mitigate high/critical hazards immediately',
      impact: 'High - Blocks certification progress',
      effort: 'Medium'
    });
  }

  // Check for failed test cases
  const failedTests = projectStats?.test_cases?.failed || 0;
  if (failedTests > 0) {
    issues.push({
      type: 'test_failure',
      severity: 'high',
      message: `${failedTests} test cases have failed and need resolution`,
      actionable: true
    });
    recommendations.push({
      priority: 2,
      action: 'Investigate and resolve failed test cases',
      impact: 'High - Affects validation status',
      effort: 'Variable'
    });
  }

  // Check for pending requirements
  const draftRequirements = projectStats?.requirements?.draft || 0;
  const inReviewRequirements = projectStats?.requirements?.in_review || 0;
  if (draftRequirements > 5) {
    issues.push({
      type: 'requirements_incomplete',
      severity: 'medium',
      message: `${draftRequirements} requirements still in draft status`,
      actionable: true
    });
    recommendations.push({
      priority: 3,
      action: 'Complete and submit draft requirements for review',
      impact: 'Medium - Delays downstream activities',
      effort: 'Low'
    });
  }

  // Check blockers
  if (blockerCount > 0) {
    issues.push({
      type: 'active_blockers',
      severity: blockerCount > 3 ? 'critical' : 'high',
      message: `${blockerCount} active blockers are impeding progress`,
      actionable: true
    });
    recommendations.push({
      priority: 1,
      action: 'Resolve open blockers to unblock certification progress',
      impact: 'Critical - Stops workflow',
      effort: 'Variable'
    });
  }

  // Check upcoming milestones
  if (milestones && milestones.length > 0) {
    const upcomingMilestone = milestones[0];
    const daysUntil = Math.ceil((new Date(upcomingMilestone.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil <= 7) {
      issues.push({
        type: 'milestone_approaching',
        severity: daysUntil <= 3 ? 'critical' : 'high',
        message: `Milestone "${upcomingMilestone.title}" due in ${daysUntil} days`,
        actionable: true
      });
    }
  }

  // Check test coverage
  const totalTests = projectStats?.test_cases?.total || 0;
  const totalRequirements = projectStats?.requirements?.total || 0;
  if (totalRequirements > 0 && totalTests < totalRequirements * 0.5) {
    issues.push({
      type: 'low_test_coverage',
      severity: 'medium',
      message: 'Test coverage appears low relative to requirements count',
      actionable: true
    });
    recommendations.push({
      priority: 3,
      action: 'Generate additional test cases to improve coverage',
      impact: 'Medium - Affects validation completeness',
      effort: 'Medium'
    });
  }

  // Generate next steps
  let stepNumber = 1;
  
  if (blockerCount > 0) {
    nextSteps.push({ step: stepNumber++, action: 'Address open blockers first' });
  }
  
  if (criticalHazards > 0 || highHazards > 0) {
    nextSteps.push({ step: stepNumber++, action: 'Review and mitigate high-risk hazards' });
  }
  
  if (failedTests > 0) {
    nextSteps.push({ step: stepNumber++, action: 'Investigate failed test cases' });
  }
  
  if (draftRequirements > 0) {
    nextSteps.push({ step: stepNumber++, action: 'Complete draft requirements' });
  }
  
  if (nextSteps.length === 0) {
    nextSteps.push({ step: 1, action: 'Continue with current certification activities' });
  }

  return {
    readinessScore,
    riskLevel,
    issues,
    recommendations,
    nextSteps,
    blockerCount
  };
}

async function generateNotifications(
  supabase: any,
  projectId: string,
  projectName: string,
  analysis: AnalysisResult
): Promise<number> {
  console.log(`Generating notifications for project: ${projectId}`);
  
  // Get project team members (approvers and creator)
  const { data: approvers } = await supabase
    .from('project_approvers')
    .select('user_id')
    .eq('project_id', projectId);

  const { data: project } = await supabase
    .from('projects')
    .select('created_by')
    .eq('id', projectId)
    .single();

  const userIds = new Set<string>();
  approvers?.forEach((a: { user_id: string }) => userIds.add(a.user_id));
  if (project?.created_by) userIds.add(project.created_by);

  if (userIds.size === 0) {
    console.log('No users to notify');
    return 0;
  }

  const notifications: any[] = [];
  const now = new Date().toISOString();

  // Create notifications for critical issues
  for (const issue of analysis.issues.filter(i => i.severity === 'critical')) {
    for (const userId of userIds) {
      notifications.push({
        user_id: userId,
        project_id: projectId,
        notification_type: 'escalation',
        title: `Critical Issue: ${projectName}`,
        message: issue.message,
        priority: 'urgent',
        action_url: `/project/${projectId}/gates`,
        action_label: 'View Project',
        metadata: { issue_type: issue.type }
      });
    }
  }

  // Create notifications for high priority issues (limit to avoid spam)
  const highIssues = analysis.issues.filter(i => i.severity === 'high').slice(0, 2);
  for (const issue of highIssues) {
    for (const userId of userIds) {
      notifications.push({
        user_id: userId,
        project_id: projectId,
        notification_type: 'status_change',
        title: `Action Required: ${projectName}`,
        message: issue.message,
        priority: 'high',
        action_url: `/project/${projectId}`,
        action_label: 'View Details',
        metadata: { issue_type: issue.type }
      });
    }
  }

  // Insert notifications
  if (notifications.length > 0) {
    const { error } = await supabase
      .from('workflow_notifications')
      .insert(notifications);

    if (error) {
      console.error('Error inserting notifications:', error);
      return 0;
    }
  }

  return notifications.length;
}

async function updateWorkflowState(
  supabase: any,
  projectId: string,
  analysis: AnalysisResult
): Promise<void> {
  console.log(`Updating workflow state for project: ${projectId}`);

  // Determine current phase based on analysis
  let currentPhase = 'planning';
  if (analysis.readinessScore >= 80) currentPhase = 'final_certification';
  else if (analysis.readinessScore >= 60) currentPhase = 'testing_validation';
  else if (analysis.readinessScore >= 40) currentPhase = 'design_verification';
  else if (analysis.readinessScore >= 20) currentPhase = 'hazard_analysis';

  // Calculate estimated completion (rough estimate based on readiness)
  const daysToComplete = Math.ceil((100 - analysis.readinessScore) * 1.5);
  const estimatedCompletion = new Date();
  estimatedCompletion.setDate(estimatedCompletion.getDate() + daysToComplete);

  // Generate next recommended action
  const nextAction = analysis.nextSteps[0]?.action || 'Continue certification activities';

  // Upsert workflow state
  const { error } = await supabase
    .from('project_workflow_state')
    .upsert({
      project_id: projectId,
      current_phase: currentPhase,
      readiness_score: analysis.readinessScore,
      blockers_count: analysis.blockerCount,
      estimated_completion: estimatedCompletion.toISOString().split('T')[0],
      next_recommended_action: nextAction,
      last_activity_at: new Date().toISOString(),
      last_analysis_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'project_id'
    });

  if (error) {
    console.error('Error updating workflow state:', error);
  }
}

serve(async (req) => {
  const monitor = new PerformanceMonitor();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { projectId, runType = 'manual' } = await req.json();
    monitor.checkpoint('request_parsed');

    // If no projectId provided, analyze all active projects
    let projectIds: string[] = [];
    
    if (projectId) {
      projectIds = [projectId];
    } else {
      // Get all non-archived projects (limited)
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_archived', false)
        .limit(CONFIG.MAX_PROJECTS_PER_RUN);

      if (error) throw error;
      projectIds = projects?.map((p: { id: string }) => p.id) || [];
    }

    console.log(`Analyzing ${projectIds.length} projects`);
    monitor.checkpoint('projects_fetched');

    const results: any[] = [];

    for (const pid of projectIds) {
      try {
        // Create analysis run record
        const { data: run, error: runError } = await supabase
          .from('agent_analysis_runs')
          .insert({
            project_id: pid,
            run_type: runType,
            status: 'running',
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (runError) {
          console.error(`Error creating run for ${pid}:`, runError);
          continue;
        }

        // Get project name for notifications
        const { data: project } = await supabase
          .from('projects')
          .select('name')
          .eq('id', pid)
          .single();

        // Perform analysis
        const analysis = await analyzeProject(supabase, pid);
        
        // Generate notifications for critical/high issues
        const notificationCount = await generateNotifications(
          supabase, 
          pid, 
          project?.name || 'Unknown Project',
          analysis
        );

        // Update workflow state
        await updateWorkflowState(supabase, pid, analysis);

        // Update analysis run record
        await supabase
          .from('agent_analysis_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            analysis_result: analysis,
            recommendations: analysis.recommendations,
            next_steps: analysis.nextSteps,
            issues_found: analysis.issues,
            notifications_generated: notificationCount
          })
          .eq('id', run.id);

        results.push({
          projectId: pid,
          projectName: project?.name,
          analysis,
          notificationsGenerated: notificationCount
        });

      } catch (projectError: unknown) {
        console.error(`Error analyzing project ${pid}:`, projectError);
        results.push({
          projectId: pid,
          error: projectError instanceof Error ? projectError.message : 'Unknown error'
        });
      }
    }

    monitor.checkpoint('complete');
    console.log(`Analysis complete. Performance: ${JSON.stringify(monitor.getSummary())}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        projectsAnalyzed: results.length,
        results 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Proactive analysis error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
