import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Standards-based control catalogs for different industries
const CONTROL_CATALOGS = {
  rail: {
    standard: 'EN 50129 / FTA',
    precedence: [
      { level: 1, name: 'Elimination', description: 'Remove hazard source from design', examples: ['Eliminate grade crossing', 'Remove manual switching'] },
      { level: 2, name: 'Design for Minimum Hazard', description: 'Inherently safe design choices', examples: ['Fail-safe signaling', 'Vital relay logic', 'Redundant braking'] },
      { level: 3, name: 'Safety Devices', description: 'Active protection systems', examples: ['ATP/ATC systems', 'Interlocking', 'Emergency brakes', 'Track circuits'] },
      { level: 4, name: 'Warning Devices', description: 'Detection and alerting', examples: ['Crossing gates/bells', 'Platform edge warnings', 'Overspeed alarms'] },
      { level: 5, name: 'Safety Alerts', description: 'Signage and visual indicators', examples: ['Speed limit signs', 'Platform gap markers', 'Emergency exit signs'] },
      { level: 6, name: 'Training & Procedures', description: 'Operational controls', examples: ['Operator certification', 'Emergency procedures', 'Safety briefings'] },
      { level: 7, name: 'Documentation', description: 'Administrative controls', examples: ['Safety case', 'Operating rules', 'Maintenance manuals'] },
    ],
    sil_requirements: {
      'SIL 4': { min_level: 1, max_level: 2, techniques: ['Formal methods', 'Diverse redundancy', 'Safety-certified components'] },
      'SIL 3': { min_level: 1, max_level: 3, techniques: ['Semi-formal methods', 'Redundancy', 'Defensive programming'] },
      'SIL 2': { min_level: 2, max_level: 4, techniques: ['Structured methods', 'Error detection', 'Watchdog timers'] },
      'SIL 1': { min_level: 3, max_level: 5, techniques: ['Good practice', 'Testing', 'Review'] },
    },
    hazard_categories: {
      'collision': ['ATP enforcement', 'Interlocking protection', 'Speed supervision'],
      'derailment': ['Track geometry monitoring', 'Speed control', 'Load management'],
      'electrocution': ['Isolation switching', 'Grounding systems', 'Access control'],
      'platform_safety': ['Platform screen doors', 'Gap fillers', 'Detection systems'],
      'fire': ['Fire detection', 'Suppression systems', 'Evacuation routes'],
    }
  },
  aviation: {
    standard: 'SAE ARP4754A / DO-178C',
    precedence: [
      { level: 1, name: 'Elimination', description: 'Design out the hazard', examples: ['Eliminate single points of failure'] },
      { level: 2, name: 'Design for Minimum Hazard', description: 'Fail-operational design', examples: ['Triple redundancy', 'Dissimilar systems', 'Graceful degradation'] },
      { level: 3, name: 'Safety Devices', description: 'Active safety systems', examples: ['TCAS', 'GPWS', 'Stall warning', 'Autothrottle'] },
      { level: 4, name: 'Warning Devices', description: 'Crew alerting', examples: ['EICAS/ECAM', 'Aural warnings', 'Master caution'] },
      { level: 5, name: 'Safety Alerts', description: 'Procedural cues', examples: ['Checklists', 'Placards', 'Limitation displays'] },
      { level: 6, name: 'Training & Procedures', description: 'Crew procedures', examples: ['Type rating', 'CRM training', 'Emergency procedures'] },
      { level: 7, name: 'Documentation', description: 'Operational limits', examples: ['AFM limitations', 'MEL', 'Safety reports'] },
    ],
    dal_requirements: {
      'DAL-A': { min_level: 1, max_level: 2, techniques: ['MC/DC coverage', 'Formal verification', 'Independent verification'] },
      'DAL-B': { min_level: 1, max_level: 3, techniques: ['Decision coverage', 'Requirements tracing', 'Code review'] },
      'DAL-C': { min_level: 2, max_level: 4, techniques: ['Statement coverage', 'Testing', 'Analysis'] },
      'DAL-D': { min_level: 3, max_level: 5, techniques: ['Basic testing', 'Review'] },
    }
  },
  automotive: {
    standard: 'ISO 26262',
    precedence: [
      { level: 1, name: 'Elimination', description: 'Avoid hazard by design', examples: ['Remove driver intervention needs'] },
      { level: 2, name: 'Design for Minimum Hazard', description: 'Inherent safety', examples: ['Fail-safe states', 'Redundant sensors'] },
      { level: 3, name: 'Safety Mechanisms', description: 'Active protection', examples: ['AEB', 'ESC', 'Lane keeping assist'] },
      { level: 4, name: 'Warning Systems', description: 'Driver alerts', examples: ['FCW', 'LDW', 'Blind spot monitoring'] },
      { level: 5, name: 'Information Systems', description: 'Driver information', examples: ['HUD displays', 'Warning lamps'] },
      { level: 6, name: 'Driver Training', description: 'User education', examples: ['Owner manual', 'Dealer training'] },
      { level: 7, name: 'Documentation', description: 'Safety records', examples: ['Safety case', 'FMEA documentation'] },
    ],
    asil_requirements: {
      'ASIL-D': { min_level: 1, max_level: 2, techniques: ['Redundant design', 'Diverse monitoring', 'Formal methods'] },
      'ASIL-C': { min_level: 1, max_level: 3, techniques: ['Monitoring', 'Diagnostics', 'Structured methods'] },
      'ASIL-B': { min_level: 2, max_level: 4, techniques: ['Error detection', 'Testing', 'Review'] },
      'ASIL-A': { min_level: 3, max_level: 5, techniques: ['Good practice', 'Testing'] },
    }
  },
  maritime: {
    standard: 'IMO / SOLAS',
    precedence: [
      { level: 1, name: 'Elimination', description: 'Design out hazard', examples: ['Eliminate flooding paths'] },
      { level: 2, name: 'Design for Minimum Hazard', description: 'Survivable design', examples: ['Watertight compartments', 'Redundant propulsion'] },
      { level: 3, name: 'Safety Devices', description: 'Protection systems', examples: ['Fire suppression', 'Bilge pumps', 'Emergency power'] },
      { level: 4, name: 'Warning Devices', description: 'Detection and alarm', examples: ['Fire alarms', 'Flooding detection', 'Man overboard'] },
      { level: 5, name: 'Safety Signage', description: 'Visual guidance', examples: ['Muster station signs', 'Safety equipment locations'] },
      { level: 6, name: 'Training & Drills', description: 'Crew preparedness', examples: ['Safety drills', 'STCW certification'] },
      { level: 7, name: 'Documentation', description: 'Safety management', examples: ['ISM Code', 'Safety certificates'] },
    ]
  }
};

// Decomposition guidance based on system hierarchy
const DECOMPOSITION_GUIDANCE = {
  system: {
    next_level: 'subsystem',
    control_focus: 'System-level interlocks and architectural controls',
    examples: ['System-wide fail-safe modes', 'Cross-subsystem interlocks', 'Global safety monitoring']
  },
  subsystem: {
    next_level: 'component',
    control_focus: 'Subsystem-specific safety functions',
    examples: ['Subsystem redundancy', 'Local safety monitoring', 'Interface protection']
  },
  component: {
    next_level: 'implementation',
    control_focus: 'Component-level fail-safe design',
    examples: ['Component self-test', 'Fail-safe states', 'Error detection circuits']
  },
  implementation: {
    next_level: null,
    control_focus: 'Detailed design techniques',
    examples: ['Defensive programming', 'Watchdog timers', 'Range checking']
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hazard_id, project_id, include_decomposition = true, additional_context = {} } = await req.json();

    console.log('Starting control recommendation for hazard:', hazard_id, 'with context:', additional_context);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch hazard details
    const { data: hazard, error: hazardError } = await supabase
      .from('hazards')
      .select('*')
      .eq('id', hazard_id)
      .single();

    if (hazardError || !hazard) {
      throw new Error('Hazard not found');
    }

    // Fetch project context
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single();

    // Fetch system definition for context
    const { data: systemDefs } = await supabase
      .from('system_definitions')
      .select('*')
      .eq('project_id', project_id);

    // Fetch CE structure for decomposition context
    const { data: certifiableElements } = await supabase
      .from('certifiable_elements')
      .select('*')
      .eq('project_id', project_id)
      .order('display_order');

    // Fetch existing requirements linked to similar hazards
    const { data: existingRequirements } = await supabase
      .from('requirements')
      .select('*')
      .eq('project_id', project_id)
      .not('hazard_id', 'is', null);

    // Determine industry for control catalog - prefer user-provided context, then project data
    const industryFromContext = additional_context.projectIndustry?.toLowerCase() || '';
    const industryFromProject = project?.industry?.toLowerCase() || '';
    const industry = industryFromContext || industryFromProject || 'rail';
    
    const industryKey = industry.includes('rail') || industry.includes('bus') || industry.includes('transit') ? 'rail' :
                        industry.includes('aviation') || industry.includes('evtol') || industry.includes('aerospace') ? 'aviation' :
                        industry.includes('automotive') || industry.includes('road') || industry.includes('highway') ? 'automotive' :
                        industry.includes('maritime') || industry.includes('ship') ? 'maritime' : 'rail';
    
    console.log(`Industry detection: context="${industryFromContext}", project="${industryFromProject}", resolved="${industryKey}"`);

    const controlCatalog = CONTROL_CATALOGS[industryKey as keyof typeof CONTROL_CATALOGS] || CONTROL_CATALOGS.rail;

    // Get SIL/ASIL requirements
    const silLevel = hazard.sil || 'SIL 2';
    const catalog = controlCatalog as any;
    const silRequirements = catalog.sil_requirements?.[silLevel] || 
                           catalog.dal_requirements?.[silLevel] ||
                           catalog.asil_requirements?.[silLevel] ||
                           { min_level: 2, max_level: 4, techniques: [] as string[] };

    // Find CE hierarchy level for decomposition
    const linkedCE = certifiableElements?.find((ce: any) => ce.id === hazard.ce_id);
    const ceLevel = (linkedCE?.type?.toLowerCase() || 'system') as keyof typeof DECOMPOSITION_GUIDANCE;
    const decompositionGuidance = DECOMPOSITION_GUIDANCE[ceLevel] || DECOMPOSITION_GUIDANCE.system;

    // Build AI prompt with standards context
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const systemPrompt = `You are an expert safety engineer specializing in ${controlCatalog.standard} standards for ${industry} systems.

Your task is to recommend specific controls (mitigations) for a hazard based on:
1. The design precedence hierarchy (prefer higher levels for severe hazards)
2. The applicable ${silLevel} requirements
3. The system decomposition level (${ceLevel})
4. Industry best practices from ${controlCatalog.standard}

Design Precedence Hierarchy (${controlCatalog.standard}):
${controlCatalog.precedence.map(p => `Level ${p.level}: ${p.name} - ${p.description}`).join('\n')}

For ${silLevel}, controls should primarily use levels ${silRequirements.min_level}-${silRequirements.max_level}.
Required techniques: ${silRequirements.techniques?.join(', ') || 'Standard good practice'}

Current decomposition level: ${ceLevel}
${decompositionGuidance.control_focus}
${include_decomposition ? `Consider decomposition to ${decompositionGuidance.next_level || 'detailed implementation'} level.` : ''}

IMPORTANT: Requirements FORMALIZE controls. Each requirement is a formal "shall" statement that makes a control verifiable and traceable.
SIL assignment logic: First derive SIL from hazard category (e.g., collision/derailment = SIL 4, fire/evacuation = SIL 3), then refine based on risk level (catastrophic/critical = maintain or increase, marginal = allow one level lower).

Return a JSON object with:
{
  "primary_controls": [
    {
      "name": "Control name",
      "precedence_level": 1-7,
      "description": "Detailed control description",
      "standard_reference": "Specific standard clause/section",
      "verification_method": "Analysis|Test|Inspection|Demonstration",
      "implementation_notes": "How to implement this control",
      "confidence": 0.0-1.0
    }
  ],
  "decomposed_controls": [
    {
      "subsystem_level": "Next hierarchy level name",
      "controls": [
        {
          "name": "Subsystem-specific control",
          "precedence_level": 1-7,
          "description": "Control at decomposed level",
          "rationale": "Why this control is needed at this level"
        }
      ]
    }
  ],
  "requirement_suggestions": [
    {
      "control_formalized": "Name of the control this requirement formalizes",
      "title": "Requirement title (concise, action-oriented)",
      "description": "The system shall [specific verifiable behavior]. Use normative 'shall' language.",
      "rationale": "Why this requirement is needed to formalize the control",
      "type": "Safety|Functional|Performance|Design Criteria",
      "verification_method": "Analysis|Test|Inspection|Demonstration",
      "sil": "SIL level derived from hazard category first, then risk",
      "sil_rationale": "Brief explanation of SIL derivation based on category and risk"
    }
  ],
  "standards_guidance": {
    "primary_standard": "${controlCatalog.standard}",
    "relevant_clauses": ["clause references"],
    "compliance_notes": "Notes on achieving compliance"
  }
}`;

    // Derive SIL from hazard category first, then risk level
    const hazardCategory = hazard.analysis_type?.toLowerCase() || hazard.title?.toLowerCase() || '';
    const categorySilMapping: Record<string, string> = {
      'collision': 'SIL 4',
      'derailment': 'SIL 4',
      'electrocution': 'SIL 4',
      'fire': 'SIL 3',
      'evacuation': 'SIL 3',
      'platform_safety': 'SIL 3',
      'door': 'SIL 3',
      'communication': 'SIL 2',
      'information': 'SIL 2',
      'operational': 'SIL 2',
    };
    
    let derivedSil = 'SIL 2'; // Default
    for (const [category, sil] of Object.entries(categorySilMapping)) {
      if (hazardCategory.includes(category)) {
        derivedSil = sil;
        break;
      }
    }
    
    // Refine based on risk level
    const riskLevel = hazard.risk_level?.toLowerCase() || '';
    if (riskLevel === 'catastrophic' || riskLevel === 'critical' || hazard.severity === 'catastrophic') {
      // Maintain or increase SIL for critical risks
      const silNumber = parseInt(derivedSil.replace('SIL ', ''));
      if (silNumber < 4) {
        derivedSil = `SIL ${Math.min(silNumber + 1, 4)}`;
      }
    } else if (riskLevel === 'marginal' || riskLevel === 'negligible') {
      // Allow one level lower for marginal risks
      const silNumber = parseInt(derivedSil.replace('SIL ', ''));
      if (silNumber > 1) {
        derivedSil = `SIL ${silNumber - 1}`;
      }
    }

    const userPrompt = `Analyze this hazard and recommend appropriate controls:

HAZARD DETAILS:
- UID: ${hazard.uid}
- Title: ${hazard.title}
- Description: ${hazard.description || 'Not specified'}
- Severity: ${hazard.severity}
- Likelihood: ${hazard.likelihood}
- Risk Level: ${hazard.risk_level}
- Hazard Category: ${hazard.analysis_type || 'General'}
- Current Mitigation: ${hazard.mitigation || 'None specified'}

SIL DERIVATION:
- Category-based SIL: ${derivedSil} (derived from hazard category: ${hazard.analysis_type || 'General'})
- Risk refinement: ${riskLevel || 'Not specified'}
- Final assigned SIL: ${derivedSil}

PROJECT CONTEXT:
- Industry: ${project?.industry || 'Rail Transit'}
- Framework: ${project?.framework || 'FTA'}
- Standard: ${project?.standard || 'EN 50129'}

SYSTEM CONTEXT:
${systemDefs?.map((sd: any) => `- ${sd.system_name}: ${sd.system_description?.substring(0, 200)}...`).join('\n') || 'No system definition available'}

OPERATING ENVIRONMENT:
${systemDefs?.map((sd: any) => sd.operating_environment ? `- ${sd.operating_environment}` : '').filter(Boolean).join('\n') || 'Not specified'}

CERTIFIABLE ELEMENT STRUCTURE:
${certifiableElements?.map((ce: any) => `- ${ce.uid} (${ce.type}): ${ce.name}`).join('\n') || 'No CEs defined'}

EXISTING SAFETY REQUIREMENTS (for context):
${existingRequirements?.slice(0, 10).map((r: any) => `- ${r.uid}: ${r.title}`).join('\n') || 'No existing requirements'}

======== DETAILED USER-PROVIDED CONTEXT ========

OPERATING ENVIRONMENT TYPE: ${additional_context.environmentType || 'Not specified'}
- This tells us the specific operational conditions (e.g., mainline vs urban metro, flight phase, etc.)
- Use this to select appropriate standards clauses and control examples

POPULATION AT RISK: ${additional_context.exposurePopulation || 'Not specified'}
- Different populations require different protection levels
- Passengers/public require highest SIL; trained staff may accept procedural controls

HAZARD PROGRESSION CHARACTERISTICS: ${additional_context.hazardProgression || 'Not specified'}
- Instantaneous hazards need preventive controls (design out the hazard)
- Gradual onset hazards can use detection + protective controls
- Latent hazards need diagnostic coverage and periodic testing

DETECTION OPPORTUNITY: ${additional_context.detectionWindow || 'Not specified'}
- Continuous monitoring possible = can use reactive safety mechanisms
- Post-event only = must use fail-safe design (prevention mandatory)
- This directly affects diagnostic coverage requirements per IEC 61508

OPERATIONAL PHASE: ${additional_context.operationalPhase || 'Not specified'}
- Revenue service hazards typically need highest assurance
- Maintenance phase can rely more on procedural controls
- Emergency phase needs robust, simple, fail-safe controls

IMPLEMENTATION CONSTRAINTS: ${additional_context.controlConstraints || 'Not specified'}
- Retrofit/brownfield limits what controls are feasible
- Weight/power constraints (aviation) affect redundancy options
- Legacy interfaces may require specific control approaches

INTERFACE COMPLEXITY: ${additional_context.interfaceComplexity || 'Not specified'}
- Single system = self-contained controls
- External interfaces = need interface hazard analysis per ARP 4761 / EN 50129
- Human-machine = operator error prevention becomes critical

AFFECTED COMPONENTS/SUBSYSTEMS: ${additional_context.affectedComponents || 'Not specified'}

EXISTING CONTROLS ALREADY IN PLACE: ${additional_context.existingControls || 'None specified'}

======== RECOMMENDATION INSTRUCTIONS ========

1. Based on the operating environment (${additional_context.environmentType || 'unspecified'}), select the most applicable standard clauses.
2. For population "${additional_context.exposurePopulation || 'passengers_public'}" at risk, ensure controls provide appropriate protection level.
3. Hazard progression "${additional_context.hazardProgression || 'instantaneous'}" should drive whether you recommend:
   - Preventive controls (levels 1-2) for instantaneous/rapid hazards
   - Detection + protective controls (levels 3-4) for gradual/predictive hazards
4. Detection window "${additional_context.detectionWindow || 'continuous_monitoring'}" determines diagnostic coverage strategy.
5. Respect implementation constraints: ${additional_context.controlConstraints || 'none specified'}.
6. For interface complexity "${additional_context.interfaceComplexity || 'single_system'}", include interface-specific controls if multi-system.
7. For severity "${hazard.severity}" and ${derivedSil}, prioritize levels 1-${hazard.severity === 'catastrophic' || hazard.severity === 'critical' ? '3' : '4'}.
8. For each control, generate a formalizing requirement with a "shall" statement.
9. Requirements FORMALIZE controls - they make the control verifiable and traceable.
10. Assign SIL to requirements based on hazard category first (${derivedSil}), then refine by risk level.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          success: false 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI credits exhausted. Please add funds to continue.',
          success: false 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices[0]?.message?.content;

    let recommendations;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      recommendations = JSON.parse(jsonStr.trim());
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      recommendations = {
        primary_controls: [],
        decomposed_controls: [],
        requirement_suggestions: [],
        standards_guidance: { primary_standard: controlCatalog.standard, relevant_clauses: [], compliance_notes: '' },
        parse_error: true
      };
    }

    // Enrich with catalog data
    recommendations.control_catalog = {
      industry: industryKey,
      standard: controlCatalog.standard,
      precedence_hierarchy: controlCatalog.precedence,
      sil_level: silLevel,
      sil_requirements: silRequirements
    };

    recommendations.decomposition_context = {
      current_level: ceLevel,
      guidance: decompositionGuidance,
      linked_ce: linkedCE ? { uid: linkedCE.uid, name: linkedCE.name, type: linkedCE.type } : null
    };

    recommendations.hazard_context = {
      id: hazard.id,
      uid: hazard.uid,
      title: hazard.title,
      severity: hazard.severity,
      risk_level: hazard.risk_level,
      derived_sil: derivedSil,
      sil_derivation: {
        category_based: derivedSil,
        risk_refinement: riskLevel || 'none',
        final: derivedSil
      }
    };

    console.log('Generated recommendations:', {
      primary_controls: recommendations.primary_controls?.length || 0,
      decomposed_controls: recommendations.decomposed_controls?.length || 0,
      requirement_suggestions: recommendations.requirement_suggestions?.length || 0
    });

    return new Response(JSON.stringify({
      success: true,
      recommendations
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in control recommendation:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
