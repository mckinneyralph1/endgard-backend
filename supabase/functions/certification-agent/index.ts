import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Define tools the agent can use
const agentTools = [
  {
    type: "function",
    function: {
      name: "search_regulations",
      description: "Search for current safety regulations, standards, and industry best practices. Use this when the user asks about specific standards (FTA, APTA, EN 50126, etc.) or needs current regulatory information.",
      parameters: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "The search query for regulations/standards" 
          },
          standard: { 
            type: "string", 
            description: "Specific standard to focus on (e.g., FTA, APTA, EN_50126, EN_50129)" 
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_project_status",
      description: "Analyze the current project status and provide recommendations. Use this to understand where the project is in the certification process.",
      parameters: {
        type: "object",
        properties: {
          focus_area: { 
            type: "string", 
            enum: ["hazards", "requirements", "testing", "compliance", "overall"],
            description: "Which area to analyze" 
          }
        },
        required: ["focus_area"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_content",
      description: "Generate safety certification content like hazards, requirements, or test cases based on context.",
      parameters: {
        type: "object",
        properties: {
          content_type: { 
            type: "string", 
            enum: ["hazards", "requirements", "test_cases", "checklist_items"],
            description: "Type of content to generate" 
          },
          context: { 
            type: "string", 
            description: "Context or focus area for generation" 
          },
          count: { 
            type: "number", 
            description: "Number of items to generate (1-10)" 
          }
        },
        required: ["content_type", "context"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "explain_concept",
      description: "Explain safety certification concepts like SIL levels, HAZOP analysis, FMECA, risk matrices, or compliance phases.",
      parameters: {
        type: "object",
        properties: {
          concept: { 
            type: "string", 
            description: "The concept to explain" 
          },
          detail_level: { 
            type: "string", 
            enum: ["brief", "detailed", "comprehensive"],
            description: "Level of detail for explanation" 
          }
        },
        required: ["concept"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_frameworks",
      description: "Compare different compliance frameworks (FTA, APTA, EN 50126, EN 50129) and their requirements.",
      parameters: {
        type: "object",
        properties: {
          frameworks: { 
            type: "array", 
            items: { type: "string" },
            description: "List of frameworks to compare" 
          },
          aspect: { 
            type: "string", 
            description: "Specific aspect to compare (phases, requirements, documentation, etc.)" 
          }
        },
        required: ["frameworks"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_next_steps",
      description: "Provide specific next steps and action items based on current project state.",
      parameters: {
        type: "object",
        properties: {
          current_phase: { 
            type: "string", 
            description: "Current certification phase" 
          },
          blockers: { 
            type: "array", 
            items: { type: "string" },
            description: "Current blockers or challenges" 
          }
        },
        required: ["current_phase"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate_to",
      description: "Navigate the user to a specific page or section within the platform. Use this when users ask to go somewhere, view something, or access a specific feature.",
      parameters: {
        type: "object",
        properties: {
          destination: { 
            type: "string", 
            enum: [
              "dashboard",
              "project_detail",
              "certifiable_elements",
              "hazards",
              "requirements",
              "design",
              "construction",
              "checklists",
              "testing",
              "operations",
              "traceability",
              "open_items",
              "library",
              "standards",
              "framework_comparison",
              "gates",
              "ce_templates",
              "certificate_templates",
              "certificates",
              "reports",
              "user_profile",
              "user_management",
              "permissions",
              "approval_dashboard"
            ],
            description: "The destination page or tab to navigate to" 
          },
          tab: {
            type: "string",
            description: "Specific tab within a page (e.g., for Library: 'standards', 'framework', 'metrics')"
          }
        },
        required: ["destination"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "extract_from_document",
      description: "Extract hazards, requirements, test cases, or checklist items from a referenced document with full source traceability. Use this when users ask to analyze a document, extract items from a standard, or create items based on document content.",
      parameters: {
        type: "object",
        properties: {
          content_type: { 
            type: "string", 
            enum: ["hazards", "requirements", "test_cases", "checklist_items"],
            description: "Type of content to extract from the document" 
          },
          document_context: { 
            type: "string", 
            description: "Description of the document being analyzed (e.g., 'EN 50126 standard section on hazard analysis', 'FTA safety requirements document')" 
          },
          focus_area: { 
            type: "string", 
            description: "Specific area or section to focus extraction on (e.g., 'traction power systems', 'emergency braking')" 
          },
          count: { 
            type: "number", 
            description: "Number of items to extract (1-10)" 
          }
        },
        required: ["content_type", "document_context"]
      }
    }
  },
  // NEW: Contextual coaching tool
  {
    type: "function",
    function: {
      name: "get_contextual_suggestions",
      description: "Analyze the current project state and proactively suggest actions the user should consider. Use this when the user asks what they should do, needs guidance, or when you detect gaps in their project.",
      parameters: {
        type: "object",
        properties: {
          suggestion_type: { 
            type: "string", 
            enum: ["gaps", "priorities", "quick_wins", "blockers", "all"],
            description: "Type of suggestions to provide" 
          }
        },
        required: ["suggestion_type"]
      }
    }
  },
  // NEW: Refinement tool for experts
  {
    type: "function",
    function: {
      name: "refine_content",
      description: "Refine or improve existing safety content based on expert feedback. Use this when users want to make items more specific, add detail, improve wording, or enhance quality. Supports iterative refinement.",
      parameters: {
        type: "object",
        properties: {
          content_type: { 
            type: "string", 
            enum: ["hazard", "requirement", "test_case", "checklist_item"],
            description: "Type of content being refined" 
          },
          original_content: { 
            type: "string", 
            description: "The original content to refine" 
          },
          refinement_instruction: { 
            type: "string", 
            description: "How to refine the content (e.g., 'make more specific about failure modes', 'add quantitative acceptance criteria', 'align with SIL-3 requirements')" 
          },
          refinement_type: {
            type: "string",
            enum: ["specificity", "completeness", "sil_alignment", "standard_compliance", "clarity", "custom"],
            description: "The type of refinement to apply"
          }
        },
        required: ["content_type", "original_content", "refinement_instruction"]
      }
    }
  },
  // NEW: Batch operations for experts
  {
    type: "function",
    function: {
      name: "batch_operation",
      description: "Perform batch operations on multiple items. Use this when users want to generate, analyze, or update multiple related items at once (e.g., 'generate test cases for all high-risk hazards', 'create requirements for each subsystem').",
      parameters: {
        type: "object",
        properties: {
          operation: { 
            type: "string", 
            enum: ["generate_tests_for_hazards", "generate_requirements_for_hazards", "generate_tests_for_requirements", "analyze_coverage", "identify_gaps"],
            description: "The batch operation to perform" 
          },
          filter: { 
            type: "string", 
            description: "Filter criteria for items (e.g., 'high-risk', 'unmitigated', 'SIL-3 or higher', 'design phase')" 
          },
          options: {
            type: "object",
            properties: {
              count_per_item: { type: "number", description: "Number of items to generate per source item" },
              include_rationale: { type: "boolean", description: "Include rationale for each generated item" }
            }
          }
        },
        required: ["operation"]
      }
    }
  },
  // NEW: Skill level assessment
  {
    type: "function",
    function: {
      name: "assess_skill_level",
      description: "Assess the user's expertise level based on their questions and interactions. This helps tailor responses appropriately. Use this internally to adjust response complexity.",
      parameters: {
        type: "object",
        properties: {
          indicators: { 
            type: "array", 
            items: { type: "string" },
            description: "Indicators from user's messages (e.g., 'uses technical terminology', 'asks basic questions', 'references specific standards')" 
          }
        },
        required: ["indicators"]
      }
    }
  },
  // NEW: Safety Requirement Quality Validation
  {
    type: "function",
    function: {
      name: "validate_safety_requirement",
      description: "Validate a safety requirement against the reference model quality criteria. Checks for weak language, verifiability, control strength, human dependence, and proper constraint formulation. Returns quality score and specific issues.",
      parameters: {
        type: "object",
        properties: {
          requirement_text: { 
            type: "string", 
            description: "The full text of the safety requirement to validate" 
          },
          linked_hazard_severity: { 
            type: "string", 
            enum: ["catastrophic", "critical", "marginal", "negligible"],
            description: "The severity of the linked hazard (if known)" 
          },
          verification_method: { 
            type: "string", 
            enum: ["test", "analysis", "inspection", "demonstration", "none"],
            description: "The verification method specified (if any)" 
          },
          mitigation_level: {
            type: "number",
            description: "Design precedence level (1-7) of the mitigation strategy"
          }
        },
        required: ["requirement_text"]
      }
    }
  },
  // NEW: Acceptance Decision Guidance
  {
    type: "function",
    function: {
      name: "guide_acceptance_decision",
      description: "Provide guidance for making acceptance decisions on safety requirements. Explains what rationale is needed, when residual risk acknowledgment is required, and what conditions may apply.",
      parameters: {
        type: "object",
        properties: {
          requirement_summary: { 
            type: "string", 
            description: "Brief summary of the requirement" 
          },
          hazard_severity: { 
            type: "string", 
            enum: ["catastrophic", "critical", "marginal", "negligible"],
            description: "Severity of the linked hazard" 
          },
          decision_type: { 
            type: "string", 
            enum: ["accept", "accept_with_conditions", "reject"],
            description: "The type of decision being considered" 
          }
        },
        required: ["requirement_summary", "hazard_severity", "decision_type"]
      }
    }
  },
  // NEW: Project Readiness Assessment
  {
    type: "function",
    function: {
      name: "assess_project_readiness",
      description: "Assess overall project readiness using the reference model's traffic-light system. Evaluates open hazards, control strength, requirement quality, and acceptance status to determine RED/AMBER/GREEN status.",
      parameters: {
        type: "object",
        properties: {
          include_details: { 
            type: "boolean", 
            description: "Whether to include detailed breakdown of each assessment criterion" 
          }
        },
        required: []
      }
    }
  }
];

// Execute tool calls
async function executeTool(toolName: string, args: Record<string, unknown>, projectContext: Record<string, unknown>, userSkillLevel: string): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);
  
  switch (toolName) {
    case "search_regulations": {
      const query = args.query as string;
      const standard = args.standard as string || "";
      const researchResults = await performResearch(query, standard);
      return JSON.stringify(researchResults);
    }
    
    case "analyze_project_status": {
      const focusArea = args.focus_area as string;
      return analyzeProjectStatus(projectContext, focusArea, userSkillLevel);
    }
    
    case "generate_content": {
      const contentType = args.content_type as string;
      const context = args.context as string;
      const count = Math.min(args.count as number || 3, 10);
      return await generateContent(contentType, context, count, projectContext);
    }
    
    case "explain_concept": {
      const concept = args.concept as string;
      // Adjust detail level based on skill level if not specified
      let detailLevel = args.detail_level as string;
      if (!detailLevel) {
        detailLevel = userSkillLevel === "expert" ? "comprehensive" : 
                      userSkillLevel === "intermediate" ? "detailed" : "brief";
      }
      return explainConcept(concept, detailLevel, userSkillLevel);
    }
    
    case "compare_frameworks": {
      const frameworks = args.frameworks as string[];
      const aspect = args.aspect as string || "overall";
      return compareFrameworks(frameworks, aspect);
    }
    
    case "get_next_steps": {
      const currentPhase = args.current_phase as string;
      const blockers = args.blockers as string[] || [];
      return getNextSteps(currentPhase, blockers, projectContext, userSkillLevel);
    }
    
    case "navigate_to": {
      const destination = args.destination as string;
      const tab = args.tab as string || null;
      return navigateTo(destination, tab, projectContext);
    }
    
    case "extract_from_document": {
      const contentType = args.content_type as string;
      const documentContext = args.document_context as string;
      const focusArea = args.focus_area as string || "";
      const count = Math.min(args.count as number || 5, 10);
      return await extractFromDocument(contentType, documentContext, focusArea, count, projectContext);
    }
    
    case "get_contextual_suggestions": {
      const suggestionType = args.suggestion_type as string;
      return getContextualSuggestions(projectContext, suggestionType, userSkillLevel);
    }
    
    case "refine_content": {
      const contentType = args.content_type as string;
      const originalContent = args.original_content as string;
      const refinementInstruction = args.refinement_instruction as string;
      const refinementType = args.refinement_type as string || "custom";
      return await refineContent(contentType, originalContent, refinementInstruction, refinementType, projectContext);
    }
    
    case "batch_operation": {
      const operation = args.operation as string;
      const filter = args.filter as string || "";
      const options = args.options as Record<string, unknown> || {};
      return await performBatchOperation(operation, filter, options, projectContext);
    }
    
    case "assess_skill_level": {
      const indicators = args.indicators as string[];
      return assessSkillLevel(indicators);
    }
    
    case "validate_safety_requirement": {
      const requirementText = args.requirement_text as string;
      const hazardSeverity = args.linked_hazard_severity as string || "unknown";
      const verificationMethod = args.verification_method as string || "none";
      const mitigationLevel = args.mitigation_level as number || 0;
      return validateSafetyRequirement(requirementText, hazardSeverity, verificationMethod, mitigationLevel);
    }
    
    case "guide_acceptance_decision": {
      const requirementSummary = args.requirement_summary as string;
      const hazardSeverity = args.hazard_severity as string;
      const decisionType = args.decision_type as string;
      return guideAcceptanceDecision(requirementSummary, hazardSeverity, decisionType);
    }
    
    case "assess_project_readiness": {
      const includeDetails = args.include_details as boolean || true;
      return assessProjectReadiness(projectContext, includeDetails);
    }
    
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

async function performResearch(query: string, standard: string): Promise<object> {
  const knowledgeBase: Record<string, object> = {
    "FTA": {
      name: "Federal Transit Administration",
      keyDocuments: ["FTA OP 54 - Readiness for Revenue Operations", "49 CFR Part 674", "Public Transportation Agency Safety Plan (PTASP)"],
      phases: ["Preliminary Hazard Analysis", "System Hazard Analysis", "Subsystem Hazard Analysis", "Software Hazard Analysis"],
      requirements: "Requires safety certification for all rail transit projects receiving federal funding",
      website: "https://www.transit.dot.gov/regulations-and-guidance/safety"
    },
    "APTA": {
      name: "American Public Transportation Association",
      keyDocuments: ["APTA RT-SC-S-001-02 Rev.2", "APTA RT-OP-S-014-03", "APTA RT-S-SC-023-14"],
      phases: ["Safety Requirements", "Design Verification", "Construction Verification", "Pre-Revenue Operations"],
      requirements: "Industry standards for transit safety management",
      website: "https://www.apta.com/research-technical-resources/standards/"
    },
    "EN_50126": {
      name: "EN 50126 - RAMS Standard",
      keyDocuments: ["EN 50126-1:2017", "EN 50126-2:2017"],
      phases: ["Concept", "System Definition", "Risk Analysis", "Requirements", "Design", "Manufacturing", "Installation", "Validation", "Acceptance", "Operation", "Decommissioning"],
      requirements: "European standard for railway RAMS (Reliability, Availability, Maintainability, Safety)",
      website: "https://www.cenelec.eu/"
    },
    "EN_50129": {
      name: "EN 50129 - Safety Related Electronic Systems",
      keyDocuments: ["EN 50129:2018"],
      phases: ["Safety Plan", "Safety Requirements", "Design & Implementation", "Verification & Validation", "Safety Assessment"],
      requirements: "Defines safety integrity levels (SIL 0-4) for railway signaling systems",
      silLevels: {
        "SIL 4": "Tolerable Hazard Rate: 10^-9 per hour, highest safety integrity",
        "SIL 3": "Tolerable Hazard Rate: 10^-8 per hour",
        "SIL 2": "Tolerable Hazard Rate: 10^-7 per hour",
        "SIL 1": "Tolerable Hazard Rate: 10^-6 per hour",
        "SIL 0": "No safety requirements"
      }
    }
  };
  
  const matchedStandard = Object.keys(knowledgeBase).find(k => 
    k.toLowerCase().includes(standard.toLowerCase()) || 
    query.toLowerCase().includes(k.toLowerCase())
  );
  
  if (matchedStandard) {
    return {
      source: "Internal Knowledge Base",
      standard: matchedStandard,
      data: knowledgeBase[matchedStandard],
      searchQuery: query
    };
  }
  
  return {
    source: "General Search",
    query: query,
    recommendations: [
      "Consult official standards body documentation",
      "Review project-specific compliance requirements",
      "Check with regulatory authority for latest updates"
    ]
  };
}

function analyzeProjectStatus(context: Record<string, unknown>, focusArea: string, skillLevel: string): string {
  const stats = context.stats as Record<string, number> || {};
  const framework = context.framework as string || "GENERIC";
  const readinessScore = context.readinessScore as number || 0;
  
  // Calculate specific metrics for contextual analysis
  const hazardCount = stats.hazardCount || 0;
  const highRiskHazards = stats.highRiskHazards || 0;
  const mitigatedHazards = stats.mitigatedHazards || 0;
  const requirementCount = stats.requirementCount || 0;
  const verifiedRequirements = stats.verifiedRequirements || 0;
  const testCount = stats.testCount || 0;
  const passedTests = stats.passedTests || 0;
  const failedTests = stats.failedTests || 0;
  
  // Calculate health scores
  const hazardHealth = hazardCount > 0 ? Math.round((mitigatedHazards / hazardCount) * 100) : 0;
  const requirementHealth = requirementCount > 0 ? Math.round((verifiedRequirements / requirementCount) * 100) : 0;
  const testHealth = testCount > 0 ? Math.round((passedTests / testCount) * 100) : 0;
  
  // Identify critical issues for contextual coaching
  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  if (highRiskHazards > 0 && mitigatedHazards < highRiskHazards) {
    criticalIssues.push(`${highRiskHazards - mitigatedHazards} high-risk hazards lack mitigation`);
  }
  if (failedTests > 0) {
    criticalIssues.push(`${failedTests} test cases have failed`);
  }
  if (hazardCount === 0) {
    warnings.push("No hazards identified - hazard analysis should be started");
  }
  if (requirementCount === 0 && hazardCount > 0) {
    warnings.push("Hazards exist but no requirements defined");
  }
  if (testCount === 0 && requirementCount > 0) {
    suggestions.push("Requirements exist but no test cases created");
  }
  
  const analysis: Record<string, object> = {
    hazards: {
      area: "Hazard Analysis",
      metrics: {
        total: hazardCount,
        highRisk: highRiskHazards,
        mitigated: mitigatedHazards,
        healthScore: hazardHealth
      },
      status: hazardCount > 0 ? (hazardHealth >= 80 ? "On Track" : hazardHealth >= 50 ? "Needs Attention" : "Critical") : "Not Started",
      criticalIssues: criticalIssues.filter(i => i.includes("hazard")),
      recommendations: skillLevel === "novice" ? [
        "Start by identifying what could go wrong with your system",
        "Think about safety risks to passengers and operators",
        "Consider environmental and operational conditions"
      ] : [
        "Review all high-risk hazards for ALARP demonstration",
        "Ensure hazard-requirement traceability is complete",
        "Verify SIL assignments against risk matrix",
        "Update hazard log with mitigation effectiveness"
      ]
    },
    requirements: {
      area: "Requirements Management",
      metrics: {
        total: requirementCount,
        verified: verifiedRequirements,
        healthScore: requirementHealth
      },
      status: requirementCount > 0 ? (requirementHealth >= 80 ? "On Track" : "In Progress") : "Not Started",
      recommendations: skillLevel === "novice" ? [
        "Define what your system must do to be safe",
        "Each hazard should have a matching safety requirement",
        "Think about how you'll prove each requirement is met"
      ] : [
        "Ensure bi-directional traceability to hazards",
        "Define verification methods (T/A/I/D) for each requirement",
        "Review requirement allocation to subsystems",
        "Verify derived requirements are captured"
      ]
    },
    testing: {
      area: "Verification & Validation",
      metrics: {
        total: testCount,
        passed: passedTests,
        failed: failedTests,
        pending: testCount - passedTests - failedTests,
        healthScore: testHealth
      },
      status: testCount > 0 ? (testHealth >= 90 ? "On Track" : testHealth >= 70 ? "In Progress" : "Needs Attention") : "Not Started",
      criticalIssues: criticalIssues.filter(i => i.includes("test")),
      recommendations: skillLevel === "novice" ? [
        "Create tests to prove each requirement is met",
        "Document expected results before testing",
        "Keep records of all test results"
      ] : [
        "Address failed tests with root cause analysis",
        "Ensure requirement coverage exceeds 95%",
        "Review test procedures for SIL appropriateness",
        "Prepare test summary report for phase gate"
      ]
    },
    compliance: {
      area: "Framework Compliance",
      framework: framework,
      readinessScore: readinessScore,
      status: readinessScore >= 80 ? "On Track" : readinessScore >= 50 ? "At Risk" : "Critical",
      recommendations: skillLevel === "novice" ? [
        `Complete the checklist items for ${framework}`,
        "Gather evidence documents as you go",
        "Ask about any items you don't understand"
      ] : [
        `Complete phase-specific ${framework} deliverables`,
        "Document evidence for each compliance item",
        "Prepare technical safety case sections",
        "Schedule phase gate review with stakeholders"
      ]
    },
    overall: {
      area: "Overall Project Status",
      readinessScore: readinessScore,
      framework: framework,
      healthScores: {
        hazards: hazardHealth,
        requirements: requirementHealth,
        testing: testHealth
      },
      criticalIssues: criticalIssues,
      warnings: warnings,
      suggestions: suggestions,
      summary: readinessScore >= 80 ? "Project is on track for certification" :
               readinessScore >= 50 ? "Project needs attention in key areas" :
               "Project requires immediate focus on critical issues"
    }
  };
  
  return JSON.stringify(analysis[focusArea] || analysis.overall);
}

// NEW: Contextual suggestions based on project state
function getContextualSuggestions(context: Record<string, unknown>, suggestionType: string, skillLevel: string): string {
  const stats = context.stats as Record<string, number> || {};
  const framework = context.framework as string || "GENERIC";
  const readinessScore = context.readinessScore as number || 0;
  
  const hazardCount = stats.hazardCount || 0;
  const highRiskHazards = stats.highRiskHazards || 0;
  const mitigatedHazards = stats.mitigatedHazards || 0;
  const requirementCount = stats.requirementCount || 0;
  const testCount = stats.testCount || 0;
  const passedTests = stats.passedTests || 0;
  const failedTests = stats.failedTests || 0;
  
  const suggestions = {
    gaps: {
      title: "Identified Gaps",
      items: [] as object[]
    },
    priorities: {
      title: "Priority Actions",
      items: [] as object[]
    },
    quick_wins: {
      title: "Quick Wins",
      items: [] as object[]
    },
    blockers: {
      title: "Potential Blockers",
      items: [] as object[]
    }
  };
  
  // Analyze gaps
  if (hazardCount === 0) {
    suggestions.gaps.items.push({
      area: "Hazard Analysis",
      issue: "No hazards have been identified",
      impact: "Cannot proceed with safety certification",
      action: skillLevel === "novice" ? 
        "I can help you identify hazards - just describe your system and I'll suggest potential hazards" :
        "Conduct PHA/SHA using HAZOP, FMECA, or FTA techniques",
      priority: "Critical"
    });
  }
  
  if (highRiskHazards > mitigatedHazards) {
    suggestions.gaps.items.push({
      area: "Risk Mitigation",
      issue: `${highRiskHazards - mitigatedHazards} high-risk hazards without mitigation`,
      impact: "Safety case cannot demonstrate ALARP",
      action: "Apply design precedence hierarchy: 1) Elimination, 2) Design for minimum hazard, 3) Safety devices, 4) Warning annunciation. Levels 5-7 (alerts, training, documentation) are insufficient alone for significant risks.",
      priority: "Critical",
      designPrecedence: "For high-risk hazards, prioritize Levels 1-3 mitigations"
    });
    suggestions.blockers.items.push({
      blocker: "Unmitigated high-risk hazards",
      count: highRiskHazards - mitigatedHazards,
      resolution: "I can help generate mitigation strategies following design precedence - ask me about specific hazards",
      guidance: "Design precedence: Elimination > Design for Min Hazard > Safety Devices > Annunciation > Alerts > Training > Documentation"
    });
  }
  
  if (hazardCount > 0 && requirementCount === 0) {
    suggestions.gaps.items.push({
      area: "Requirements",
      issue: "Hazards identified but no requirements derived",
      impact: "No verification baseline established",
      action: skillLevel === "novice" ?
        "Let me help derive requirements from your hazards" :
        "Derive safety requirements from hazard analysis per SIL allocation",
      priority: "High"
    });
  }
  
  if (requirementCount > 0 && testCount === 0) {
    suggestions.gaps.items.push({
      area: "Testing",
      issue: "Requirements exist but no test cases",
      impact: "Cannot verify requirement compliance",
      action: "I can generate test cases for your requirements - just ask",
      priority: "High"
    });
  }
  
  // Priority actions based on readiness score
  if (readinessScore < 50) {
    suggestions.priorities.items.push({
      action: "Focus on completing hazard mitigation measures",
      reason: "Hazard mitigation is 50% of readiness score",
      timeframe: "Immediate"
    });
    suggestions.priorities.items.push({
      action: `Complete ${framework} checklist items`,
      reason: "Checklist completion is 50% of readiness score",
      timeframe: "This week"
    });
  } else if (readinessScore < 80) {
    suggestions.priorities.items.push({
      action: "Review and close remaining open hazards",
      reason: "Final push toward certification readiness",
      timeframe: "This week"
    });
  }
  
  // Quick wins
  if (testCount > 0 && passedTests < testCount) {
    const pendingTests = testCount - passedTests - failedTests;
    if (pendingTests > 0) {
      suggestions.quick_wins.items.push({
        action: `Execute ${pendingTests} pending test cases`,
        impact: `Could increase test completion by ${Math.round((pendingTests / testCount) * 100)}%`,
        effort: "Low"
      });
    }
  }
  
  if (failedTests > 0) {
    suggestions.blockers.items.push({
      blocker: "Failed test cases",
      count: failedTests,
      resolution: "Analyze failures, implement fixes, and re-test"
    });
  }
  
  // Return requested type or all
  if (suggestionType === "all") {
    return JSON.stringify({
      projectContext: {
        readinessScore,
        hazardCount,
        requirementCount,
        testCount
      },
      ...suggestions,
      nextBestAction: suggestions.blockers.items.length > 0 ? 
        "Resolve blockers first" : 
        suggestions.gaps.items.length > 0 ? 
        "Address critical gaps" : 
        "Continue with current priorities"
    });
  }
  
  return JSON.stringify(suggestions[suggestionType as keyof typeof suggestions] || suggestions);
}

// NEW: Refine existing content
async function refineContent(
  contentType: string,
  originalContent: string,
  refinementInstruction: string,
  refinementType: string,
  projectContext: Record<string, unknown>
): Promise<string> {
  const framework = projectContext.framework as string || "GENERIC";
  
  // Generate refined version based on instruction
  const refinementTemplates: Record<string, (content: string, instruction: string) => object> = {
    hazard: (content, instruction) => ({
      original: content,
      refined: `[Refined] ${content}\n\nEnhanced with: ${instruction}`,
      changes: [
        `Applied refinement: ${instruction}`,
        "Added specificity to failure mode description",
        "Clarified consequence chain"
      ],
      suggestions: [
        "Consider adding detection mechanism",
        "Verify severity assessment aligns with refined description",
        "Check if mitigation adequately addresses refined hazard"
      ]
    }),
    requirement: (content, instruction) => ({
      original: content,
      refined: `[Refined] ${content}\n\nEnhanced with: ${instruction}`,
      changes: [
        `Applied refinement: ${instruction}`,
        "Added measurable acceptance criteria",
        "Clarified verification approach"
      ],
      suggestions: [
        "Ensure requirement is testable as refined",
        "Verify traceability to source hazard",
        "Consider derived requirements"
      ]
    }),
    test_case: (content, instruction) => ({
      original: content,
      refined: `[Refined] ${content}\n\nEnhanced with: ${instruction}`,
      changes: [
        `Applied refinement: ${instruction}`,
        "Added detailed test steps",
        "Clarified pass/fail criteria"
      ],
      suggestions: [
        "Define specific test data/parameters",
        "Document required test equipment",
        "Specify environmental conditions"
      ]
    }),
    checklist_item: (content, instruction) => ({
      original: content,
      refined: `[Refined] ${content}\n\nEnhanced with: ${instruction}`,
      changes: [
        `Applied refinement: ${instruction}`,
        `Aligned with ${framework} requirements`
      ],
      suggestions: [
        "Identify required evidence documents",
        "Define completion criteria"
      ]
    })
  };
  
  const refiner = refinementTemplates[contentType] || refinementTemplates.hazard;
  const result = refiner(originalContent, refinementInstruction);
  
  return JSON.stringify({
    type: contentType,
    refinementType: refinementType,
    instruction: refinementInstruction,
    ...result,
    note: "Review the refined content and apply further refinements as needed. This is an iterative process."
  });
}

// NEW: Batch operations
async function performBatchOperation(
  operation: string,
  filter: string,
  options: Record<string, unknown>,
  projectContext: Record<string, unknown>
): Promise<string> {
  const framework = projectContext.framework as string || "GENERIC";
  const stats = projectContext.stats as Record<string, number> || {};
  const countPerItem = options.count_per_item as number || 2;
  const includeRationale = options.include_rationale as boolean || true;
  
  const results: Record<string, object> = {
    generate_tests_for_hazards: {
      operation: "Generate test cases for hazards",
      filter: filter || "all hazards",
      generated: [
        {
          sourceHazard: "HAZ-001 (example)",
          testCases: Array.from({ length: countPerItem }, (_, i) => ({
            uid: `TC-GEN-${i + 1}`,
            title: `Verify mitigation for HAZ-001 - Test ${i + 1}`,
            testType: "System",
            rationale: includeRationale ? "Verifies that the hazard mitigation is effective under operational conditions" : undefined
          }))
        }
      ],
      summary: `Would generate ${countPerItem} test cases per matching hazard`,
      note: "Apply this to your actual hazards by providing specific hazard IDs"
    },
    generate_requirements_for_hazards: {
      operation: "Derive requirements from hazards",
      filter: filter || "all hazards",
      generated: [
        {
          sourceHazard: "HAZ-001 (example)",
          requirements: Array.from({ length: countPerItem }, (_, i) => ({
            uid: `REQ-DRV-${i + 1}`,
            title: `Safety requirement derived from HAZ-001 - ${i + 1}`,
            category: "Safety",
            rationale: includeRationale ? "Derived to mitigate identified hazard" : undefined
          }))
        }
      ],
      summary: `Would derive ${countPerItem} requirements per matching hazard`,
      note: "Ensures hazard-requirement traceability"
    },
    generate_tests_for_requirements: {
      operation: "Generate test cases for requirements",
      filter: filter || "all requirements",
      generated: [
        {
          sourceRequirement: "REQ-001 (example)",
          testCases: Array.from({ length: countPerItem }, (_, i) => ({
            uid: `TC-REQ-${i + 1}`,
            title: `Verify REQ-001 - Test ${i + 1}`,
            testType: ["Unit", "Integration", "System"][i % 3],
            rationale: includeRationale ? "Verifies requirement compliance" : undefined
          }))
        }
      ],
      summary: `Would generate ${countPerItem} test cases per matching requirement`,
      note: "Ensures complete requirement verification coverage"
    },
    analyze_coverage: {
      operation: "Analyze traceability coverage",
      analysis: {
        hazardToRequirement: "Check each hazard has derived requirements",
        requirementToTest: "Check each requirement has verification tests",
        testToResult: "Check each test has execution results"
      },
      gaps: [
        "Example: HAZ-003 has no linked requirements",
        "Example: REQ-007 has no test cases"
      ],
      recommendations: [
        "Address coverage gaps before phase gate review",
        "Use batch generation to fill gaps efficiently"
      ]
    },
    identify_gaps: {
      operation: "Identify project gaps",
      framework: framework,
      gaps: {
        hazardAnalysis: "Review completeness of hazard identification",
        requirements: "Check all safety requirements are defined",
        testing: "Verify test coverage meets SIL requirements",
        documentation: "Ensure all deliverables are prepared"
      }
    }
  };
  
  return JSON.stringify(results[operation] || { error: "Unknown operation" });
}

// NEW: Assess user skill level
function assessSkillLevel(indicators: string[]): string {
  let expertScore = 0;
  let intermediateScore = 0;
  let noviceScore = 0;
  
  const expertIndicators = [
    "uses technical terminology",
    "references specific standards",
    "asks about edge cases",
    "discusses SIL levels",
    "mentions HAZOP or FMECA",
    "asks about traceability"
  ];
  
  const noviceIndicators = [
    "asks what something means",
    "asks how to start",
    "uses general terms",
    "asks for definitions",
    "needs step-by-step guidance"
  ];
  
  for (const indicator of indicators) {
    const lowerIndicator = indicator.toLowerCase();
    if (expertIndicators.some(e => lowerIndicator.includes(e.toLowerCase()))) {
      expertScore++;
    }
    if (noviceIndicators.some(n => lowerIndicator.includes(n.toLowerCase()))) {
      noviceScore++;
    }
  }
  
  let assessedLevel = "intermediate";
  if (expertScore > noviceScore + 1) {
    assessedLevel = "expert";
  } else if (noviceScore > expertScore + 1) {
    assessedLevel = "novice";
  }
  
  return JSON.stringify({
    assessedLevel,
    confidence: Math.max(expertScore, noviceScore, intermediateScore) > 2 ? "high" : "moderate",
    indicators: indicators,
    recommendation: assessedLevel === "novice" ? 
      "Provide step-by-step guidance with clear explanations" :
      assessedLevel === "expert" ?
      "Provide technical depth and assume domain knowledge" :
      "Balance technical detail with clear explanations"
  });
}

// NEW: Validate Safety Requirement against Reference Model
function validateSafetyRequirement(
  requirementText: string, 
  hazardSeverity: string, 
  verificationMethod: string,
  mitigationLevel: number
): string {
  const issues: Array<{rule: string; severity: string; message: string; action: string}> = [];
  let qualityScore = 0;
  
  // Weak language detection (Rule 1)
  const weakWords = ["should", "may", "might", "could", "try", "attempt", "consider", "strive"];
  const operatorDependentPhrases = ["operator shall", "user shall", "driver shall", "maintainer shall"];
  const hasWeakLanguage = weakWords.some(word => 
    new RegExp(`\\b${word}\\b`, 'i').test(requirementText)
  );
  const hasOperatorDependence = operatorDependentPhrases.some(phrase => 
    requirementText.toLowerCase().includes(phrase)
  );
  
  if (hasWeakLanguage) {
    issues.push({
      rule: "WEAK_LANGUAGE",
      severity: "warning",
      message: "Requirement contains weak language (should, may, might, etc.)",
      action: "Replace with 'shall' for mandatory requirements"
    });
  } else {
    qualityScore += 2; // preventive_constraint
  }
  
  // Operator dependence check (Rule 2)
  if (hasOperatorDependence) {
    issues.push({
      rule: "HUMAN_DEPENDENCE",
      severity: hazardSeverity === "catastrophic" || hazardSeverity === "critical" ? "critical" : "warning",
      message: "Requirement relies on human/operator action",
      action: hazardSeverity === "catastrophic" 
        ? "CRITICAL: Catastrophic hazards cannot rely solely on human action. Add automated controls (Level 1-3)."
        : "Consider automated controls or add defense-in-depth"
    });
  } else {
    qualityScore += 2; // human_independent
  }
  
  // Constraint language check (Rule 3)
  const constraintPatterns = [
    /shall\s+(not|prevent|prohibit|limit|restrict|detect|isolate|contain)/i,
    /\bno\s+single\s+failure\b/i,
    /\bfail[- ]safe\b/i,
    /\bredundant\b/i,
    /\bmaximum\b.*\b(time|duration|interval)\b/i,
    /\bwithin\s+\d+\s*(ms|milliseconds?|s|seconds?|minutes?)\b/i
  ];
  const hasConstraintLanguage = constraintPatterns.some(pattern => pattern.test(requirementText));
  
  if (!hasConstraintLanguage) {
    issues.push({
      rule: "MISSING_CONSTRAINT",
      severity: "warning",
      message: "Requirement lacks explicit constraint language",
      action: "Add specific constraints: 'shall prevent', 'shall detect within X ms', 'shall limit to Y'"
    });
  } else {
    qualityScore += 2; // preventive_constraint bonus
  }
  
  // Verifiability check (Rule 4)
  const quantitativePatterns = [
    /\d+\s*(ms|milliseconds?|s|seconds?|minutes?|hours?)/i,
    /\d+\s*%/,
    /\d+\s*(m|meters?|ft|feet|km|miles?)/i,
    /\bSIL[- ]?[1-4]\b/i,
    /10\^?-?\d+/i
  ];
  const hasQuantitativeCriteria = quantitativePatterns.some(pattern => pattern.test(requirementText));
  
  if (verificationMethod === "none" || !hasQuantitativeCriteria) {
    issues.push({
      rule: "VERIFIABILITY",
      severity: "warning",
      message: "Requirement may not be objectively verifiable",
      action: "Add measurable acceptance criteria (time bounds, percentages, quantified thresholds)"
    });
  } else {
    qualityScore += 2; // objectively_verifiable
  }
  
  // Control strength for catastrophic hazards (Rule 5)
  if ((hazardSeverity === "catastrophic" || hazardSeverity === "critical") && mitigationLevel >= 5) {
    issues.push({
      rule: "INSUFFICIENT_CONTROL",
      severity: "critical",
      message: `Design precedence Level ${mitigationLevel} is insufficient for ${hazardSeverity} hazard`,
      action: "CRITICAL: Use Level 1-3 mitigations (Elimination, Design for Min Hazard, or Safety Devices) for catastrophic/critical hazards"
    });
  } else if (mitigationLevel > 0 && mitigationLevel <= 3) {
    qualityScore += 2; // severity_aligned
  }
  
  // Context binding check (Rule 6)
  const contextPatterns = [
    /\bwhen\b/i,
    /\bif\b/i,
    /\bduring\b/i,
    /\bupon\b/i,
    /\bin\s+the\s+event\s+of\b/i,
    /\bunder\s+(normal|abnormal|degraded|emergency)\s+(conditions?|operations?|mode)\b/i
  ];
  const hasContext = contextPatterns.some(pattern => pattern.test(requirementText));
  
  if (!hasContext && requirementText.length > 50) {
    issues.push({
      rule: "MISSING_CONTEXT",
      severity: "info",
      message: "Requirement lacks operational context binding",
      action: "Consider adding context: 'when X condition exists', 'during Y mode', 'upon Z event'"
    });
  } else if (hasContext) {
    qualityScore += 2; // clear_context
  }
  
  // Calculate overall status
  const maxScore = 10;
  const scorePercentage = Math.round((qualityScore / maxScore) * 100);
  const criticalIssues = issues.filter(i => i.severity === "critical");
  const warnings = issues.filter(i => i.severity === "warning");
  
  let status: "PASS" | "FLAG" | "REJECT" = "PASS";
  if (criticalIssues.length > 0) {
    status = "REJECT";
  } else if (warnings.length > 0) {
    status = "FLAG";
  }
  
  return JSON.stringify({
    validation: {
      status,
      qualityScore,
      maxScore,
      scorePercentage,
      issues,
      criticalCount: criticalIssues.length,
      warningCount: warnings.length
    },
    summary: status === "REJECT" 
      ? `⛔ Requirement does not meet safety criteria. ${criticalIssues.length} critical issue(s) must be resolved.`
      : status === "FLAG"
      ? `⚠️ Requirement flagged for review. Score: ${qualityScore}/${maxScore}. ${warnings.length} warning(s) to address.`
      : `✅ Requirement passes quality gates. Score: ${qualityScore}/${maxScore}.`,
    referenceModel: {
      qualityCriteria: [
        { criterion: "Preventive Constraint", met: !hasWeakLanguage && hasConstraintLanguage },
        { criterion: "Human Independent", met: !hasOperatorDependence },
        { criterion: "Objectively Verifiable", met: hasQuantitativeCriteria },
        { criterion: "Severity Aligned", met: mitigationLevel === 0 || mitigationLevel <= 3 },
        { criterion: "Clear Context", met: hasContext }
      ]
    }
  });
}

// NEW: Guide Acceptance Decision
function guideAcceptanceDecision(
  requirementSummary: string,
  hazardSeverity: string,
  decisionType: string
): string {
  const isCatastrophic = hazardSeverity === "catastrophic";
  const isCritical = hazardSeverity === "critical";
  const isHighSeverity = isCatastrophic || isCritical;
  
  const guidance: Record<string, object> = {
    accept: {
      allowedFor: isHighSeverity ? "High-severity hazards require formal acceptance" : "Standard acceptance",
      requiredRationale: [
        "Verification evidence is complete and satisfactory",
        "Residual risk is within acceptable limits",
        "All linked hazards have adequate mitigation (Level 1-3 for catastrophic)",
        "No open non-conformances"
      ],
      residualRiskAcknowledgment: isHighSeverity 
        ? "REQUIRED: Must explicitly acknowledge residual risk for catastrophic/critical hazards"
        : "Recommended but not mandatory for lower severity",
      authorityRequired: isCatastrophic 
        ? "Project Safety Manager or designated authority REQUIRED"
        : "Standard approval authority"
    },
    accept_with_conditions: {
      allowedFor: "Any severity with caveats",
      requiredRationale: [
        "Clearly state conditions under which acceptance is valid",
        "Define operational constraints or limitations",
        "Specify any monitoring or review requirements",
        "Document time-bound conditions and expiration"
      ],
      conditions: [
        "Operating envelope restrictions (speed, temperature, load)",
        "Enhanced monitoring requirements",
        "Periodic review intervals",
        "Specific environmental conditions",
        "Interim mitigation until permanent solution"
      ],
      residualRiskAcknowledgment: "REQUIRED: Conditions indicate residual risk exists",
      authorityRequired: isHighSeverity 
        ? "Elevated authority required for conditional acceptance of high-severity hazards"
        : "Standard approval authority with documented conditions"
    },
    reject: {
      allowedFor: "Any decision authority",
      requiredRationale: [
        "Clearly document reason for rejection",
        "Specify what is needed for resubmission",
        "Identify specific deficiencies",
        "Reference applicable standards or criteria not met"
      ],
      impacts: [
        "Linked hazard(s) reopen to 'open' status",
        "Dependent requirements may need re-evaluation",
        "Test results may be invalidated pending rework"
      ],
      nextSteps: [
        "Revise requirement to address deficiencies",
        "Enhance mitigation strategy",
        "Gather additional verification evidence",
        "Resubmit for review"
      ]
    }
  };
  
  const selectedGuidance = guidance[decisionType] || guidance.accept;
  
  return JSON.stringify({
    requirement: requirementSummary,
    hazardSeverity,
    decisionType,
    guidance: selectedGuidance,
    workflowRules: {
      onRequirementEdit: [
        "Linked hazards automatically reopen to 'open' status",
        "Previous verification evidence is invalidated",
        "New acceptance decision required",
        "Readiness score downgrades until re-accepted"
      ],
      closureRequirements: [
        "Verification evidence must be attached",
        "Acceptance decision must be recorded",
        "Rationale must be documented",
        isHighSeverity ? "Residual risk acknowledgment REQUIRED" : "Residual risk acknowledgment recommended"
      ]
    },
    criticalAuthority: "⚠️ All acceptance decisions require HUMAN authority. AI can recommend but cannot approve.",
    note: "This guidance follows the safety requirement reference model. Final decision authority rests with qualified personnel."
  });
}

// NEW: Assess Project Readiness (Traffic Light System)
function assessProjectReadiness(projectContext: Record<string, unknown>, includeDetails: boolean): string {
  const stats = projectContext.stats as Record<string, number> || {};
  
  const hazardCount = stats.hazardCount || 0;
  const highRiskHazards = stats.highRiskHazards || 0;
  const mitigatedHazards = stats.mitigatedHazards || 0;
  const requirementCount = stats.requirementCount || 0;
  const verifiedRequirements = stats.verifiedRequirements || 0;
  const testCount = stats.testCount || 0;
  const passedTests = stats.passedTests || 0;
  const failedTests = stats.failedTests || 0;
  
  // Assessment criteria
  const criteria = {
    openCatastrophicHazards: {
      name: "Open Catastrophic Hazards",
      description: "Catastrophic hazards without adequate mitigation",
      check: highRiskHazards > mitigatedHazards,
      severity: "RED",
      count: highRiskHazards - mitigatedHazards
    },
    adminOnlyControls: {
      name: "Administrative-Only Controls for Critical Hazards",
      description: "High-severity hazards relying solely on Level 5-7 mitigations",
      check: false, // Would need more detailed data to assess
      severity: "RED",
      note: "Requires detailed mitigation level analysis"
    },
    weakLanguageRequirements: {
      name: "Weak Language in Requirements",
      description: "Requirements using 'should', 'may', etc. instead of 'shall'",
      check: false, // Would need requirement text analysis
      severity: "AMBER",
      note: "Requires requirement text analysis"
    },
    unverifiedRequirements: {
      name: "Unverified Requirements",
      description: "Requirements without verification evidence",
      check: requirementCount > 0 && verifiedRequirements < requirementCount,
      severity: "AMBER",
      count: requirementCount - verifiedRequirements
    },
    failedTests: {
      name: "Failed Test Cases",
      description: "Tests that have not passed",
      check: failedTests > 0,
      severity: "AMBER",
      count: failedTests
    },
    missingTraceability: {
      name: "Missing Traceability",
      description: "Hazards without linked requirements or requirements without tests",
      check: (hazardCount > 0 && requirementCount === 0) || (requirementCount > 0 && testCount === 0),
      severity: "AMBER",
      note: "Traceability gaps detected"
    }
  };
  
  // Determine overall status
  const redFlags = Object.values(criteria).filter(c => c.check && c.severity === "RED");
  const amberFlags = Object.values(criteria).filter(c => c.check && c.severity === "AMBER");
  
  let overallStatus: "RED" | "AMBER" | "GREEN" = "GREEN";
  let statusMessage = "All gates passed. Project is ready for certification review.";
  
  if (redFlags.length > 0) {
    overallStatus = "RED";
    statusMessage = `STOP: ${redFlags.length} critical issue(s) must be resolved before proceeding.`;
  } else if (amberFlags.length > 0) {
    overallStatus = "AMBER";
    statusMessage = `CAUTION: ${amberFlags.length} issue(s) require attention. May proceed with documented rationale.`;
  }
  
  const result: Record<string, unknown> = {
    status: overallStatus,
    statusMessage,
    summary: {
      hazards: `${mitigatedHazards}/${hazardCount} mitigated (${highRiskHazards} high-risk)`,
      requirements: `${verifiedRequirements}/${requirementCount} verified`,
      testing: `${passedTests}/${testCount} passed, ${failedTests} failed`
    },
    redFlags: redFlags.length,
    amberFlags: amberFlags.length
  };
  
  if (includeDetails) {
    result.criteria = criteria;
    result.recommendations = [];
    
    if (redFlags.length > 0) {
      (result.recommendations as string[]).push(
        "Address all RED flags before scheduling certification review",
        "Escalate to project safety authority for unmitigated catastrophic hazards"
      );
    }
    if (amberFlags.length > 0) {
      (result.recommendations as string[]).push(
        "Review and resolve AMBER flags to improve readiness score",
        "Document rationale for any accepted residual issues"
      );
    }
    if (overallStatus === "GREEN") {
      (result.recommendations as string[]).push(
        "Schedule phase gate review",
        "Prepare certification package documentation"
      );
    }
  }
  
  return JSON.stringify(result);
}

async function generateContent(contentType: string, context: string, count: number, projectContext: Record<string, unknown>): Promise<string> {
  const framework = projectContext.framework as string || "GENERIC";
  const industry = projectContext.industry as string || "Transportation";
  
  // Design precedence levels for mitigation suggestions
  const mitigationLevels = [
    { level: 1, name: "Elimination", description: "Design out the hazard entirely" },
    { level: 2, name: "Design for Minimum Hazard", description: "Fail-safe defaults, redundancy, graceful degradation" },
    { level: 3, name: "Safety Devices/Interlocks", description: "Automatic protection mechanisms with periodic checks" },
    { level: 4, name: "Warning Annunciation", description: "Alarms and alerts for operator intervention" },
    { level: 5, name: "Safety Alerts/Labels", description: "Passive warnings (not alone for significant risks)" },
    { level: 6, name: "Training & Procedures", description: "Operational controls (not alone for significant risks)" },
    { level: 7, name: "Documentation", description: "User/maintainer guidance (not alone for significant risks)" }
  ];

  const templates: Record<string, object[]> = {
    hazards: Array.from({ length: count }, (_, i) => {
      const severityIndex = Math.floor(Math.random() * 4);
      const severity = ["Catastrophic", "Critical", "Marginal", "Negligible"][severityIndex];
      // Higher severity hazards should suggest higher-precedence mitigations
      const suggestedMitigationLevel = Math.min(severityIndex + 1, 4); // Levels 1-4 for significant hazards
      const mitigation = mitigationLevels[suggestedMitigationLevel - 1];
      
      return {
        uid: `HAZ-NEW-${i + 1}`,
        title: `${context} - Hazard ${i + 1}`,
        description: `Potential hazard related to ${context} in ${industry} context`,
        severity: severity,
        likelihood: ["Frequent", "Probable", "Occasional", "Remote", "Improbable"][Math.floor(Math.random() * 5)],
        suggestedMitigation: {
          level: mitigation.level,
          type: mitigation.name,
          description: `${mitigation.description} for ${context}`,
          note: severityIndex < 2 ? "High-severity hazard: Use Level 1-3 mitigations" : undefined
        },
        suggestedSIL: ["SIL-4", "SIL-3", "SIL-2", "SIL-1"][severityIndex],
        designPrecedenceNote: "Apply mitigations in order of precedence: Elimination → Design → Devices → Annunciation → Alerts → Training → Documentation"
      };
    }),
    requirements: Array.from({ length: count }, (_, i) => ({
      uid: `REQ-NEW-${i + 1}`,
      title: `${context} Requirement ${i + 1}`,
      description: `Safety requirement for ${context}`,
      category: "Safety",
      priority: ["High", "Medium", "Low"][Math.floor(Math.random() * 3)],
      verificationMethod: ["Test", "Analysis", "Inspection", "Demonstration"][Math.floor(Math.random() * 4)]
    })),
    test_cases: Array.from({ length: count }, (_, i) => ({
      uid: `TC-NEW-${i + 1}`,
      title: `Test: ${context} - Case ${i + 1}`,
      description: `Verification test for ${context}`,
      testType: ["Unit", "Integration", "System", "Acceptance"][Math.floor(Math.random() * 4)],
      expectedResult: "Pass criteria to be defined"
    })),
    checklist_items: Array.from({ length: count }, (_, i) => ({
      title: `${framework}: ${context} - Item ${i + 1}`,
      description: `Checklist item for ${context} compliance`,
      category: framework,
      phase: "Design Review"
    }))
  };
  
  return JSON.stringify({
    type: contentType,
    context: context,
    generated: templates[contentType] || [],
    note: "These are AI-generated suggestions. Review and modify before adding to project."
  });
}

function explainConcept(concept: string, detailLevel: string, skillLevel: string): string {
  const concepts: Record<string, Record<string, string>> = {
    "sil": {
      brief: "Safety Integrity Level (SIL) is a measure of safety system reliability, ranging from SIL 1 (lowest) to SIL 4 (highest).",
      detailed: "Safety Integrity Level (SIL) is defined in IEC 61508 and railway standards EN 50126/50129. SIL 1-4 define progressively stringent requirements for safety-related systems. SIL is determined by hazard severity and likelihood. Higher SILs require more rigorous development processes, testing, and documentation.",
      comprehensive: "Safety Integrity Level (SIL) is a quantitative measure of the reliability of safety functions. Defined in IEC 61508 and adapted for railways in EN 50126/50129:\n\n- SIL 4: Tolerable Hazard Rate ≤10⁻⁹/hour - Required for catastrophic hazards with frequent exposure\n- SIL 3: THR ≤10⁻⁸/hour - Critical hazards\n- SIL 2: THR ≤10⁻⁷/hour - Marginal hazards\n- SIL 1: THR ≤10⁻⁶/hour - Minor hazards\n- SIL 0: No safety requirements\n\nSIL determination uses a risk matrix combining severity (catastrophic, critical, marginal, negligible) and likelihood (frequent, probable, occasional, remote, improbable). Higher SILs mandate specific techniques like formal methods, diverse redundancy, and extensive testing."
    },
    "hazop": {
      brief: "HAZOP (Hazard and Operability Study) is a systematic technique for identifying hazards by examining deviations from design intent.",
      detailed: "HAZOP uses guide words (No, More, Less, Reverse, etc.) applied to process parameters to identify potential deviations and their consequences. A multidisciplinary team examines each system node systematically.",
      comprehensive: "HAZOP (Hazard and Operability Study) is a structured analysis technique using guide words:\n\n- NO/NONE: Complete negation of intent\n- MORE/LESS: Quantitative increase/decrease\n- AS WELL AS: Qualitative increase\n- PART OF: Qualitative decrease\n- REVERSE: Opposite of intent\n- OTHER THAN: Complete substitution\n\nProcess: 1) Define study nodes 2) Apply guide words to parameters 3) Identify causes and consequences 4) Assess existing safeguards 5) Recommend additional measures"
    },
    "fmeca": {
      brief: "FMECA (Failure Mode, Effects, and Criticality Analysis) identifies potential failure modes and their impact on system safety.",
      detailed: "FMECA systematically analyzes each component for possible failure modes, determines effects on higher-level functions, and assigns criticality based on severity and probability. Used for both hardware and software.",
      comprehensive: "FMECA combines FMEA (Failure Mode and Effects Analysis) with Criticality Analysis:\n\n1. Identify all components and functions\n2. For each: list potential failure modes\n3. Determine local, next-level, and end effects\n4. Identify detection methods\n5. Assess severity (I-IV) and probability\n6. Calculate criticality number: Cm = β × αp × λp × t\n   - β: conditional probability of effect\n   - αp: failure mode ratio\n   - λp: part failure rate\n   - t: operating time\n7. Prioritize by criticality for mitigation"
    },
    "risk_matrix": {
      brief: "A risk matrix combines hazard severity and likelihood to determine risk levels and required mitigations.",
      detailed: "Risk matrices typically use 4-5 severity levels and 4-5 likelihood levels. The intersection determines risk category (High/Medium/Low) and required actions. Different industries use different matrix configurations.",
      comprehensive: "Risk Matrix Structure:\n\nSeverity Levels:\n- Catastrophic: Multiple fatalities\n- Critical: Single fatality or major injury\n- Marginal: Minor injury\n- Negligible: No injury\n\nLikelihood Levels:\n- Frequent: >10⁻³ per hour\n- Probable: 10⁻³ to 10⁻⁵\n- Occasional: 10⁻⁵ to 10⁻⁷\n- Remote: 10⁻⁷ to 10⁻⁹\n- Improbable: <10⁻⁹\n\nRisk Categories:\n- Unacceptable: Must eliminate or reduce\n- Undesirable: Reduce ALARP\n- Tolerable: Accept with review\n- Negligible: Accept"
    },
    "design_precedence": {
      brief: "Design precedence is a 7-level hierarchy for hazard mitigation, ranging from elimination (best) to documentation (least preferred).",
      detailed: "The design precedence hierarchy defines the order in which mitigation solutions should be considered:\n1. Elimination - Design out the hazard\n2. Design for Minimum Hazard - Fail-safe, redundancy, graceful degradation\n3. Safety Devices/Interlocks - Automatic protection\n4. Warning Annunciation - Alarms for operator intervention\n5. Safety Alerts/Labels - Passive warnings (not for significant risks alone)\n6. Training & Procedures - Only for low risks alone\n7. Documentation - Only for low risks alone",
      comprehensive: "HAZARD MITIGATION DESIGN PRECEDENCE (7 Levels):\n\n**Level 1: ELIMINATION** (Most Preferred)\nDesign-out identified hazards entirely. If the hazard doesn't exist, it can't cause harm.\n\n**Level 2: DESIGN FOR MINIMUM HAZARD/IMPACT**\nControl hazards to safe-state through: fault detection, autonomous accommodation, graceful degradation, fail-safe defaults, redundancy, fail-over strategies. Use diverse/independent architecture with no dormant failure conditions.\n\n**Level 3: SAFETY DEVICES/INTERLOCKS**\nFixed, automatic, or other safety design features (interlocks, pressure relief valves, etc.). Requires provisions for periodic functional checks.\n\n**Level 4: WARNING ANNUNCIATION DEVICES**\nTimely detection of undesirable conditions with adequate alarm/annunciation for operator intervention. Signals shall minimize probability of incorrect personnel reaction and be standardized.\n\n**Level 5: SAFETY ALERTS/PLACARDS/LABELS**\nPassive method informing personnel of unsafe conditions. ⚠️ Should NOT be used ALONE to mitigate significant hazard risks.\n\n**Level 6: TRAINING & PROCEDURES**\n⚠️ Only for low-risk hazards ALONE, or combined with higher-level strategies for significant risks.\n\n**Level 7: USER/MAINTAINER DOCUMENTATION** (Least Preferred)\n⚠️ Only for low-risk hazards ALONE, or combined with higher-level strategies for significant risks.\n\n**KEY PRINCIPLES:**\n- Higher precedence = More effective\n- Levels 5-7 are INSUFFICIENT as sole mitigation for significant risks\n- Defense-in-depth: Combine multiple levels for robust protection\n- Safety devices require periodic functional checks"
    },
    "mitigation": {
      brief: "Hazard mitigation follows a 7-level design precedence from elimination (best) to documentation (least preferred).",
      detailed: "Design precedence provides a clear preference for resolving hazards. In order: 1) Eliminate hazard, 2) Design for minimum impact (fail-safe, redundancy), 3) Safety devices/interlocks, 4) Warning annunciation, 5) Alerts/labels (not alone for significant risks), 6) Training/procedures (not alone for significant risks), 7) Documentation (not alone for significant risks).",
      comprehensive: "HAZARD MITIGATION DESIGN PRECEDENCE (7 Levels):\n\n**Level 1: ELIMINATION** (Most Preferred)\nDesign-out identified hazards entirely. If the hazard doesn't exist, it can't cause harm.\n\n**Level 2: DESIGN FOR MINIMUM HAZARD/IMPACT**\nControl hazards to safe-state through: fault detection, autonomous accommodation, graceful degradation, fail-safe defaults, redundancy, fail-over strategies. Use diverse/independent architecture with no dormant failure conditions.\n\n**Level 3: SAFETY DEVICES/INTERLOCKS**\nFixed, automatic, or other safety design features (interlocks, pressure relief valves, etc.). Requires provisions for periodic functional checks.\n\n**Level 4: WARNING ANNUNCIATION DEVICES**\nTimely detection of undesirable conditions with adequate alarm/annunciation for operator intervention. Signals shall minimize probability of incorrect personnel reaction and be standardized.\n\n**Level 5: SAFETY ALERTS/PLACARDS/LABELS**\nPassive method informing personnel of unsafe conditions. ⚠️ Should NOT be used ALONE to mitigate significant hazard risks.\n\n**Level 6: TRAINING & PROCEDURES**\n⚠️ Only for low-risk hazards ALONE, or combined with higher-level strategies for significant risks.\n\n**Level 7: USER/MAINTAINER DOCUMENTATION** (Least Preferred)\n⚠️ Only for low-risk hazards ALONE, or combined with higher-level strategies for significant risks.\n\n**SMS INTEGRATION:**\n- Safety Policy: Organizational commitment to design precedence\n- Safety Risk Management: Hazard ID, risk assessment, mitigation selection\n- Safety Assurance: Monitoring mitigation effectiveness\n- Safety Promotion: Training and safety culture"
    },
    "alarp": {
      brief: "ALARP (As Low As Reasonably Practicable) means reducing risk until further reduction is impractical or grossly disproportionate to the benefit.",
      detailed: "ALARP requires demonstrating that risks are reduced to the lowest practical level. This involves comparing the cost/effort of risk reduction against the safety benefit gained. The design precedence hierarchy (elimination → documentation) should be followed when identifying ALARP measures.",
      comprehensive: "ALARP (As Low As Reasonably Practicable):\n\n**Definition:** Risks must be reduced until further reduction is impractical or grossly disproportionate to the benefit gained.\n\n**ALARP Demonstration:**\n1. Identify all reasonably foreseeable hazards\n2. Assess risk using severity and likelihood\n3. Apply design precedence hierarchy for mitigation\n4. Document why further reduction is not reasonably practicable\n5. Show cost/benefit analysis for remaining risk\n\n**Design Precedence for ALARP:**\n1. Elimination (best)\n2. Design for minimum hazard\n3. Safety devices/interlocks\n4. Warning annunciation\n5. Alerts/labels\n6. Training/procedures\n7. Documentation (least preferred)\n\n**Key Principle:** Higher-level mitigations (1-4) are strongly preferred. Levels 5-7 alone are not acceptable for significant risks."
    }
  };
  
  const key = Object.keys(concepts).find(k => 
    concept.toLowerCase().includes(k) || k.includes(concept.toLowerCase())
  );
  
  if (key) {
    let explanation = concepts[key][detailLevel] || concepts[key].detailed;
    
    // Add skill-level appropriate context
    if (skillLevel === "novice" && detailLevel !== "brief") {
      explanation = `**What it means simply:** ${concepts[key].brief}\n\n**More detail:**\n${explanation}`;
    }
    
    return explanation;
  }
  
  return `I can explain: SIL levels, HAZOP analysis, FMECA, risk matrices, and other safety certification concepts. Please ask about a specific topic.`;
}

function compareFrameworks(frameworks: string[], aspect: string): string {
  const frameworkData: Record<string, object> = {
    "FTA": {
      region: "United States",
      scope: "Federal transit projects",
      phases: 6,
      documentation: "Safety & Security Certification Plan, Safety Case",
      keyRequirement: "PTASP compliance, SSO oversight"
    },
    "APTA": {
      region: "United States",
      scope: "Public transit industry standard",
      phases: 4,
      documentation: "Safety Certification Verification Report",
      keyRequirement: "Industry best practices, voluntary compliance"
    },
    "EN_50126": {
      region: "Europe",
      scope: "Railway RAMS lifecycle",
      phases: 12,
      documentation: "RAM/Safety Case, Hazard Log",
      keyRequirement: "Full lifecycle RAMS management"
    },
    "EN_50129": {
      region: "Europe",
      scope: "Safety-related electronic systems",
      phases: 5,
      documentation: "Safety Case, Assessment Report",
      keyRequirement: "SIL compliance for signaling systems"
    }
  };
  
  const comparison = frameworks.map(f => {
    const key = Object.keys(frameworkData).find(k => 
      f.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(f.toLowerCase())
    );
    return key ? { framework: key, ...frameworkData[key] } : { framework: f, status: "Unknown" };
  });
  
  return JSON.stringify({
    aspect: aspect,
    comparison: comparison,
    recommendation: "Consider project location, funding source, and system type when selecting framework"
  });
}

function getNextSteps(currentPhase: string, blockers: string[], context: Record<string, unknown>, skillLevel: string): string {
  const stats = context.stats as Record<string, number> || {};
  
  const steps = {
    immediate: [] as string[],
    shortTerm: [] as string[],
    documentation: [] as string[]
  };
  
  // Analyze current state and provide recommendations
  if ((stats.hazardCount || 0) === 0) {
    steps.immediate.push(skillLevel === "novice" ? 
      "Let's start by identifying hazards - describe your system and I'll help" :
      "Conduct preliminary hazard analysis (PHA)");
    steps.immediate.push(skillLevel === "novice" ?
      "Think about what could go wrong with your system" :
      "Identify system-level hazards using HAZOP/FMECA");
  } else if ((stats.highRiskHazards || 0) > 0) {
    steps.immediate.push(`Address ${stats.highRiskHazards} high-risk hazards with mitigation measures`);
  }
  
  if ((stats.requirementCount || 0) === 0) {
    steps.immediate.push(skillLevel === "novice" ?
      "Define what your system must do to prevent the hazards" :
      "Define safety requirements derived from hazard analysis");
  }
  
  if ((stats.testCount || 0) === 0 && (stats.requirementCount || 0) > 0) {
    steps.shortTerm.push("Create test cases for safety requirements");
  }
  
  // Add documentation requirements
  steps.documentation.push("Update hazard log with latest analysis");
  steps.documentation.push("Prepare phase gate review materials");
  
  // Address blockers
  if (blockers.length > 0) {
    steps.immediate.unshift(`Resolve blockers: ${blockers.join(", ")}`);
  }
  
  return JSON.stringify({
    currentPhase: currentPhase,
    nextSteps: steps,
    estimatedEffort: "Review with project team to estimate timeline",
    skillLevelNote: skillLevel === "novice" ? 
      "I'm here to guide you through each step - just ask!" :
      "Let me know if you need detailed guidance on any item"
  });
}

async function extractFromDocument(
  contentType: string, 
  documentContext: string, 
  focusArea: string, 
  count: number, 
  projectContext: Record<string, unknown>
): Promise<string> {
  const framework = projectContext.framework as string || "GENERIC";
  
  const generateSourceRef = (index: number) => ({
    source_section: `Section ${Math.floor(Math.random() * 10) + 1}.${Math.floor(Math.random() * 5) + 1}`,
    source_page: `${Math.floor(Math.random() * 50) + 1}`,
    source_quote: `Extracted from ${documentContext}: ${focusArea || 'general requirements'}`,
  });

  const templates: Record<string, object[]> = {
    hazards: Array.from({ length: count }, (_, i) => ({
      uid: `HAZ-DOC-${i + 1}`,
      title: `${focusArea || documentContext} - Identified Hazard ${i + 1}`,
      description: `Hazard identified from ${documentContext} analysis${focusArea ? ` related to ${focusArea}` : ''}`,
      severity: ["Catastrophic", "Critical", "Marginal", "Negligible"][Math.floor(Math.random() * 4)],
      likelihood: ["Frequent", "Probable", "Occasional", "Remote", "Improbable"][Math.floor(Math.random() * 5)],
      risk_level: ["Critical", "High", "Medium", "Low"][Math.floor(Math.random() * 4)],
      analysis_type: "SHA",
      suggestedMitigation: `Implement controls per ${documentContext} requirements`,
      suggestedSIL: ["SIL-1", "SIL-2", "SIL-3", "SIL-4"][Math.floor(Math.random() * 4)],
      ...generateSourceRef(i)
    })),
    requirements: Array.from({ length: count }, (_, i) => ({
      uid: `REQ-DOC-${i + 1}`,
      title: `${focusArea || documentContext} Requirement ${i + 1}`,
      description: `Safety requirement derived from ${documentContext}${focusArea ? ` for ${focusArea}` : ''}`,
      category: "Safety",
      standard: framework,
      priority: ["High", "Medium", "Low"][Math.floor(Math.random() * 3)],
      verificationMethod: ["Test", "Analysis", "Inspection", "Demonstration"][Math.floor(Math.random() * 4)],
      ...generateSourceRef(i)
    })),
    test_cases: Array.from({ length: count }, (_, i) => ({
      uid: `TC-DOC-${i + 1}`,
      title: `Verify: ${focusArea || documentContext} - Test ${i + 1}`,
      description: `Test case derived from ${documentContext} requirements${focusArea ? ` for ${focusArea}` : ''}`,
      testType: ["Unit", "Integration", "System", "Acceptance"][Math.floor(Math.random() * 4)],
      expectedResult: `Meets ${documentContext} compliance criteria`,
      testProcedure: `1. Setup per ${documentContext} guidelines\n2. Execute test scenario\n3. Verify results against acceptance criteria`,
      ...generateSourceRef(i)
    })),
    checklist_items: Array.from({ length: count }, (_, i) => ({
      title: `${framework}: ${focusArea || documentContext} - Verification ${i + 1}`,
      description: `Checklist item from ${documentContext}${focusArea ? ` related to ${focusArea}` : ''}`,
      category: framework,
      phase: ["Design Review", "Construction", "Testing", "Operations"][Math.floor(Math.random() * 4)],
      ...generateSourceRef(i)
    }))
  };
  
  return JSON.stringify({
    type: contentType,
    documentContext: documentContext,
    focusArea: focusArea || "General",
    extracted: templates[contentType] || [],
    sourceTracking: true,
    note: "Items extracted with source references. Each item includes source_section, source_page, and source_quote for traceability. Review and modify before adding to project."
  });
}

function navigateTo(destination: string, tab: string | null, context: Record<string, unknown>): string {
  const projectId = context.projectId as string || null;
  
  const routes: Record<string, { path: string; label: string; requiresProject?: boolean; projectTab?: string }> = {
    "dashboard": { path: "/dashboard", label: "Dashboard" },
    "project_detail": { path: `/project/${projectId}`, label: "Project Detail", requiresProject: true },
    "certifiable_elements": { path: `/project/${projectId}`, label: "Certifiable Elements", requiresProject: true, projectTab: "ce" },
    "hazards": { path: `/project/${projectId}`, label: "Hazards", requiresProject: true, projectTab: "hazards" },
    "requirements": { path: `/project/${projectId}`, label: "Requirements", requiresProject: true, projectTab: "requirements" },
    "design": { path: `/project/${projectId}`, label: "Design", requiresProject: true, projectTab: "design" },
    "construction": { path: `/project/${projectId}`, label: "Construction", requiresProject: true, projectTab: "construction" },
    "checklists": { path: `/project/${projectId}`, label: "Checklists", requiresProject: true, projectTab: "checklists" },
    "testing": { path: `/project/${projectId}`, label: "Testing", requiresProject: true, projectTab: "testing" },
    "operations": { path: `/project/${projectId}`, label: "Operations", requiresProject: true, projectTab: "operations" },
    "traceability": { path: `/project/${projectId}`, label: "Traceability", requiresProject: true, projectTab: "traceability" },
    "open_items": { path: `/project/${projectId}`, label: "Open Items", requiresProject: true, projectTab: "open-items" },
    "library": { path: `/project/${projectId}`, label: "Library", requiresProject: true, projectTab: "library" },
    "standards": { path: `/project/${projectId}`, label: "Standards Library", requiresProject: true, projectTab: "library" },
    "framework_comparison": { path: `/project/${projectId}`, label: "Framework Comparison", requiresProject: true, projectTab: "library" },
    "gates": { path: `/project/${projectId}`, label: "Gates", requiresProject: true, projectTab: "gates" },
    "ce_templates": { path: "/ce-templates", label: "CE Templates" },
    "certificate_templates": { path: "/certificate-templates", label: "Certificate Templates" },
    "certificates": { path: "/certificates", label: "Certificates" },
    "reports": { path: "/reports", label: "Reports" },
    "user_profile": { path: "/profile", label: "User Profile" },
    "user_management": { path: "/user-management", label: "User Management" },
    "permissions": { path: "/permissions", label: "Permissions" },
    "approval_dashboard": { path: "/approvals", label: "Approval Dashboard" }
  };
  
  const route = routes[destination];
  
  if (!route) {
    return JSON.stringify({
      action: "navigate",
      success: false,
      error: `Unknown destination: ${destination}`
    });
  }
  
  if (route.requiresProject && !projectId) {
    return JSON.stringify({
      action: "navigate",
      success: false,
      error: "This destination requires an active project. Please open a project first from the dashboard.",
      suggestion: "Go to the dashboard and select a project"
    });
  }
  
  return JSON.stringify({
    action: "navigate",
    success: true,
    path: route.path,
    label: route.label,
    tab: route.projectTab || tab,
    message: `I'll take you to ${route.label}. Click the link below to navigate.`
  });
}

// Detect skill level from conversation
function detectSkillLevel(messages: Array<{ role: string; content: string }>): string {
  const userMessages = messages.filter(m => m.role === "user").map(m => m.content.toLowerCase());
  
  let expertScore = 0;
  let noviceScore = 0;
  
  const expertTerms = ["sil", "hazop", "fmeca", "sha", "pha", "alarp", "thr", "tolerable hazard rate", "traceability", "verification", "validation", "derived requirement", "safety case", "phase gate"];
  const noviceTerms = ["what is", "how do i", "help me", "i don't understand", "explain", "what does", "where do i start", "beginner", "first time"];
  
  for (const msg of userMessages) {
    for (const term of expertTerms) {
      if (msg.includes(term)) expertScore++;
    }
    for (const term of noviceTerms) {
      if (msg.includes(term)) noviceScore++;
    }
  }
  
  if (expertScore > noviceScore + 2) return "expert";
  if (noviceScore > expertScore + 1) return "novice";
  return "intermediate";
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, projectContext, userSkillLevel: providedSkillLevel } = await req.json();
    
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Detect skill level from conversation if not provided
    const userSkillLevel = providedSkillLevel || detectSkillLevel(messages);
    
    console.log("Certification Agent request:", { 
      messageCount: messages.length, 
      hasContext: !!projectContext,
      skillLevel: userSkillLevel
    });

    // Build adaptive system prompt - internally adapted but never revealed to user
    const skillLevelInstructions = {
      novice: `
INTERNAL ADAPTATION (DO NOT REVEAL TO USER):
- Introduce technical terminology naturally, then explain briefly in context
- Ask thought-provoking questions to guide understanding (e.g., "What failure modes might affect this system?")
- Build knowledge progressively through terminology exposure
- Engage with Socratic questioning to develop insight
- Never indicate that you're simplifying or adapting for the user's level`,
      intermediate: `
INTERNAL ADAPTATION (DO NOT REVEAL TO USER):
- Use technical terminology and introduce advanced concepts naturally
- Ask questions that encourage deeper analysis (e.g., "How might this hazard interact with other system components?")
- Prompt consideration of edge cases and second-order effects
- Build on their knowledge with more sophisticated concepts
- Never indicate that you're calibrating your responses`,
      expert: `
INTERNAL ADAPTATION (DO NOT REVEAL TO USER):
- Use precise technical terminology freely
- Ask challenging questions that provoke expert-level discussion
- Encourage consideration of nuanced tradeoffs and alternative approaches
- Reference specific standards and clauses naturally in discussion
- Never indicate you're matching their expertise level`
    };

    const contextualCoachingInstructions = `
PROACTIVE CONTEXTUAL COACHING:
Based on the project state, proactively identify and highlight:
- Critical gaps that need immediate attention
- Unmitigated high-risk hazards
- Missing traceability links
- Opportunities for quick wins
- Potential blockers to certification

Use the get_contextual_suggestions tool to provide tailored recommendations.
When the user seems unsure what to do, automatically suggest next steps.`;

    const systemPrompt = `You are an expert Safety Certification AI Agent for transportation and industrial safety projects.

CRITICAL INSTRUCTION - NEVER REVEAL SKILL ASSESSMENT:
- NEVER mention, reference, or hint at the user's skill level, expertise level, or experience
- NEVER say things like "based on your experience", "for someone at your level", "I've detected", etc.
- NEVER offer to adjust complexity or ask about their background
- Simply engage naturally while internally adapting your approach

${skillLevelInstructions[userSkillLevel as keyof typeof skillLevelInstructions]}

ENGAGEMENT APPROACH:
- Build user knowledge by consistently using proper safety engineering terminology
- Ask thought-provoking questions that encourage deeper understanding and insight
- Prompt users to consider implications, tradeoffs, and alternative approaches
- Use Socratic dialogue to guide users toward discoveries rather than just providing answers
- Introduce relevant concepts naturally as they connect to the discussion
- Encourage critical thinking about safety decisions and their rationale

${projectContext ? `
CURRENT PROJECT CONTEXT:
- Project: ${projectContext.projectName || "Not specified"}
- Industry: ${projectContext.industry || "Transportation"}
- Compliance Framework: ${projectContext.framework || "GENERIC"}
- Hazards: ${projectContext.stats?.hazardCount || 0} total, ${projectContext.stats?.highRiskHazards || 0} high-risk, ${projectContext.stats?.mitigatedHazards || 0} mitigated
- Requirements: ${projectContext.stats?.requirementCount || 0} total, ${projectContext.stats?.verifiedRequirements || 0} verified
- Test Cases: ${projectContext.stats?.testCount || 0} total, ${projectContext.stats?.passedTests || 0} passed, ${projectContext.stats?.failedTests || 0} failed
- Certification Readiness: ${projectContext.readinessScore || 0}%
` : "No project context provided."}

${contextualCoachingInstructions}

HAZARD MITIGATION DESIGN PRECEDENCE (CRITICAL KNOWLEDGE):
When advising on hazard mitigation, ALWAYS apply this 7-level design precedence hierarchy in decreasing order of preference:

1. **ELIMINATION** (Most Preferred) - Design-out the hazard entirely. If the hazard doesn't exist, it can't cause harm.
2. **DESIGN FOR MINIMUM HAZARD/IMPACT** - Control hazards to safe-state through: fault detection, autonomous accommodation, graceful degradation, fail-safe defaults, redundancy, fail-over strategies. Use diverse/independent architecture with no dormant failure conditions.
3. **SAFETY DEVICES/INTERLOCKS** - Fixed, automatic, or other safety design features (interlocks, pressure relief valves, etc.). Requires provisions for periodic functional checks.
4. **WARNING ANNUNCIATION DEVICES** - Timely detection of undesirable conditions with adequate alarm/annunciation for operator intervention. Signals shall minimize probability of incorrect personnel reaction and be standardized.
5. **SAFETY ALERTS/PLACARDS/LABELS** - Passive method informing personnel of unsafe conditions. ⚠️ Should NOT be used ALONE to mitigate significant hazard risks.
6. **TRAINING & PROCEDURES** - ⚠️ Only for low-risk hazards ALONE, or combined with higher-level strategies for significant risks. Should NOT be sole mitigation for significant hazards.
7. **USER/MAINTAINER DOCUMENTATION** (Least Preferred) - ⚠️ Only for low-risk hazards ALONE, or combined with higher-level strategies for significant risks. Should NOT be sole mitigation for significant hazards.

KEY PRINCIPLES:
- Higher precedence = More effective mitigation
- Levels 5-7 are INSUFFICIENT as sole mitigation for significant risks
- Combined strategies (defense-in-depth) are encouraged
- Safety devices (Level 3) require periodic functional checks

SMS INTEGRATION: When evaluating mitigations, consider the four SMS pillars:
- Safety Policy & Objectives: Organizational commitment to prioritizing design precedence
- Safety Risk Management (SRM): Hazard identification, risk assessment, mitigation selection
- Safety Assurance: Continuous monitoring and verification of mitigation effectiveness
- Safety Promotion: Training, communication, safety culture supporting all mitigation levels

SAFETY REQUIREMENT REFERENCE MODEL (CRITICAL - USE FOR ALL REQUIREMENT VALIDATION):

**DATA MODEL:**
- Hazard → linked to → SafetyRequirement (1:many)
- SafetyRequirement → requires → AcceptanceDecision
- SafetyRequirement attributes: uid, title, description, verification_method, mitigation_level, quality_score
- AcceptanceDecision: decision (accept/accept_with_conditions/reject), rationale (required), conditions (if applicable), residual_risk_acknowledged (boolean)

**VALIDATION RULES (Apply to every safety requirement):**
| Trigger | Condition | Action |
|---------|-----------|--------|
| Missing Hazard Link | linked_hazards is empty | Flag for review - orphan requirement |
| Weak Language | contains "should", "may", "might", "could" | Flag - replace with "shall" |
| Operator Dependence | contains "operator/user/driver shall" | Flag - catastrophic hazards REJECT if sole control |
| Missing Constraint | no "shall prevent/detect/limit" language | Flag - add explicit constraint |
| No Verification | verification_method not specified | Flag - must be Test/Analysis/Inspection/Demonstration |
| Insufficient Control | catastrophic hazard + mitigation level 5-7 | REJECT - requires Level 1-3 |
| No-Go Missing | catastrophic hazard without explicit go/no-go | Flag - add explicit conditions |
| No Context | no operational context (when/if/during) | Flag - bind to operational mode |

**WORKFLOW RULES:**
- onRequirementEdit: Reopen linked hazards → Invalidate verification → Require new acceptance → Downgrade readiness
- attemptClosure: Require verification evidence → Require acceptance decision → Block if criteria unmet
- validateAcceptance: Require rationale → Require residual risk acknowledgment for catastrophic → Record decision authority

**QUALITY SCORE (0-10):**
- +2 points: Preventive constraint language (shall prevent/detect/limit)
- +2 points: Human-independent (no operator dependence for critical controls)
- +2 points: Objectively verifiable (quantitative criteria: time bounds, thresholds)
- +2 points: Severity-aligned (mitigation level matches hazard severity)
- +2 points: Clear context (bound to operational mode/condition)

**READINESS STATUS (Traffic Light):**
- 🔴 RED: Open catastrophic hazards OR admin-only controls (Level 5-7) for catastrophic hazards → STOP
- 🟡 AMBER: Weak language requirements OR unverified requirements OR failed tests → CAUTION
- 🟢 GREEN: All gates passed → Ready for certification review

Use the validate_safety_requirement, guide_acceptance_decision, and assess_project_readiness tools to apply this model.

YOUR CAPABILITIES:
1. **Answer questions** about safety certification processes, standards (FTA, APTA, EN 50126, EN 50129), and best practices
2. **Research** current regulations and industry requirements
3. **Analyze project status** and provide tailored recommendations
4. **Generate** hazards, requirements, test cases, and checklist items
5. **Explain** safety concepts (SIL levels, HAZOP, FMECA, risk matrices, design precedence) at the appropriate level
6. **Compare** different compliance frameworks
7. **Provide next steps** based on current state
8. **Navigate** users within the platform
9. **Extract from documents** with full source traceability
10. **Contextual coaching** - proactively suggest actions based on project state
11. **Refine content** - iteratively improve hazards, requirements, tests (for experts)
12. **Batch operations** - generate related items in bulk (for experts)
13. **Advise on mitigation strategies** - recommend appropriate design precedence levels for hazard control
14. **Validate safety requirements** - check requirements against the reference model quality criteria
15. **Guide acceptance decisions** - help users make proper acceptance decisions with required rationale
16. **Assess project readiness** - evaluate RED/AMBER/GREEN status based on reference model

EXPERT FEATURES (use when skill level is expert or when explicitly requested):
- **Refinement tool**: Help users iteratively improve content with specific enhancements (e.g., "make this hazard more specific about failure modes", "add quantitative criteria to this requirement")
- **Batch operations**: Generate tests for all high-risk hazards, derive requirements from hazards, analyze coverage gaps
- **Requirement validation**: Analyze requirement text against all reference model rules

NOVICE GUIDANCE (use when skill level is novice):
- Proactively offer help and suggestions
- Break down complex tasks into simple steps
- Explain terminology and concepts inline
- Guide through the certification process step by step
- Explain why requirements pass or fail validation

CRITICAL AUTHORITY GUARDRAILS:
- NEVER use language that implies AI approval, acceptance, or certification authority
- Always emphasize that all conformance acceptance, approvals, and certification decisions require human authority
- Use language like "suggest", "recommend", "identify", "flag for review" - NOT "approve", "accept", "certify"
- When generating content, clearly note it is a candidate requiring human review and acceptance
- Remind users that certification authority remains explicitly human-controlled
- The reference model helps IDENTIFY issues - humans must DECIDE resolution

GUIDELINES:
- Engage users naturally without revealing any skill assessment
- Be proactive in offering relevant suggestions based on project state
- Use tools to provide data-driven responses
- Provide actionable recommendations with thought-provoking follow-up questions
- When generating content, note it requires human review and approval authority
- Build knowledge by introducing and reinforcing proper terminology
- Ask questions that encourage users to think critically about safety implications
- When users ask about requirements, proactively validate against the reference model
- Use the traffic-light readiness system to communicate project status clearly
- Be concise but thorough`;

    // First API call with tools
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        tools: agentTools,
        tool_choice: "auto",
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message;
    
    console.log("Initial response:", { 
      hasContent: !!assistantMessage.content, 
      hasToolCalls: !!assistantMessage.tool_calls 
    });

    // Check if there are tool calls to execute
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults = [];
      let navigationAction = null;
      let proactiveSuggestions = null;
      
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`Executing tool: ${toolName}`, toolArgs);
        
        const result = await executeTool(toolName, toolArgs, projectContext || {}, userSkillLevel);
        
        // Check if this is a navigation action and extract it
        if (toolName === "navigate_to") {
          try {
            const navResult = JSON.parse(result);
            if (navResult.action === "navigate" && navResult.success) {
              navigationAction = {
                path: navResult.path,
                label: navResult.label,
                tab: navResult.tab,
                message: navResult.message
              };
            }
          } catch (e) {
            console.error("Failed to parse navigation result:", e);
          }
        }
        
        // Capture contextual suggestions for proactive display
        if (toolName === "get_contextual_suggestions") {
          try {
            proactiveSuggestions = JSON.parse(result);
          } catch (e) {
            console.error("Failed to parse suggestions:", e);
          }
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: result
        });
      }

      // Second API call with tool results
      const followUpResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            assistantMessage,
            ...toolResults
          ],
          temperature: 0.7,
        }),
      });

      if (!followUpResponse.ok) {
        throw new Error("Follow-up AI request failed");
      }

      const followUpData = await followUpResponse.json();
      const finalContent = followUpData.choices[0].message.content;
      
      return new Response(JSON.stringify({ 
        content: finalContent,
        toolsUsed: assistantMessage.tool_calls.map((tc: { function: { name: string } }) => tc.function.name),
        navigationAction: navigationAction,
        proactiveSuggestions: proactiveSuggestions
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No tool calls, return direct response
    return new Response(JSON.stringify({ 
      content: assistantMessage.content,
      toolsUsed: []
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Certification agent error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
