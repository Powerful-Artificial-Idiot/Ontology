import type { AgentLanguage, AgentResponseMessage } from "./agentDemoTypes";

type ScriptedAgentResponse = Omit<AgentResponseMessage, "id">;
type LocalizedResponseCopy = Pick<ScriptedAgentResponse, "summary" | "findings" | "recommendedActions" | "risks" | "assumptions">;

const englishResponseCopyByTurnId = {
  "quality-impact": {
    summary: "This request is classified as a cross-domain quality-abnormality trace. The OP30 Leak Rate abnormality is linked to the Brake Booster Assembly route, M220, CTQ controls, and governed quality documents, and may increase waiting before OP40, rework and retest load, and temporary quality-bottleneck risk.",
    findings: [
      "Production: OP30 lies between OP20 and OP40 and affects the Brake Booster Assembly route.",
      "Quality: Leak Rate / CTQ Leak Rate is controlled through the 100% Leak Test, Control Plan, and PFMEA.",
      "Engineering: M220, FX-002, LeakTestProgram V3.4, and the SOP form the governed test resources.",
      "Value Stream: The abnormality may increase retest load and waiting before OP40.",
    ],
    recommendedActions: [
      "Review the latest OP30 Leak Rate distribution.",
      "Confirm M220 calibration, FX-002 condition, and the deployed program version.",
      "Review the detection controls in the Control Plan and PFMEA.",
      "Monitor OP40 waiting time and the retest queue.",
    ],
    risks: ["A sustained abnormality could create a temporary quality-bottleneck risk."],
    assumptions: ["The currently released OP30 control documents remain effective."],
  },
  "quality-program-follow-up": {
    summary: "An M220 program-version change can affect test logic, CTQ decisions, quality-risk controls, and retest load through the usesProgram, affects, requiresValidation, controls, governedBy, and riskAnalyzedBy relationships.",
    findings: [
      "Engineering: V3.5 is a proposed version and must be linked to an ECR and Validation Record.",
      "Quality: Leak Rate decisions must remain aligned with the Control Plan and PFMEA.",
      "Production: OP30 output may decline if false rejects increase.",
      "Value Stream: Additional retesting will increase waiting before OP40.",
    ],
    recommendedActions: [
      "Compare V3.4 and V3.5 logic, parameters, and checksums.",
      "Confirm the V3.5 validation result.",
      "Verify alignment with the Control Plan threshold.",
      "Compare Leak Rate distributions before and after the change.",
    ],
    risks: ["An unapproved logic change could cause false accepts or false rejects."],
    assumptions: ["V3.5 has not received formal release approval."],
  },
  "quality-validation-plan": {
    summary: "Prioritize five validation groups in risk order: program identity, equipment condition, Leak Rate data, quality documents, and a controlled trial. Retain an accountable owner and evidence record for every action.",
    findings: [
      "Production: Confirm whether OP30 output or cycle time and OP40 waiting have changed.",
      "Quality: Compare the Leak Rate baseline and review the Control Plan and PFMEA.",
      "Engineering: Validate M220 calibration, FX-002, and V3.4/V3.5.",
      "Value Stream: Monitor the retest queue and WIP before OP40.",
    ],
    recommendedActions: [
      "Freeze the currently deployed M220 program version.",
      "Retrieve OP30 Leak Rate records from before and after the change.",
      "Validate M220 calibration and fixture condition.",
      "Review the Control Plan and PFMEA.",
      "Run a controlled trial and attach the M220 Program V3.5 Validation Record.",
    ],
    risks: ["Running a trial before confirming program identity and equipment condition would weaken the credibility of the validation."],
    assumptions: ["The OP30, M220, and Leak Rate context resolved in the first two turns remains valid."],
  },
  "engineering-program-impact": {
    summary: "Upgrading M220 from V3.4 to V3.5 directly affects OP30 and, through the controls relationship, affects Leak Rate / CTQ Leak Rate. Release requires an aligned ECR, V3.5 validation record, SOP, Control Plan, and PFMEA.",
    findings: [
      "Engineering: V3.5 requires an ECR and an approved validation record.",
      "Quality: The CTQ Leak Rate decision criteria cannot be changed by the program alone.",
      "Production: OP30 is the directly affected operation.",
      "Value Stream: Additional false rejects or retests will affect waiting before OP40.",
    ],
    recommendedActions: [
      "Compare V3.4 and V3.5 logic and parameters.",
      "Run the validation trial and create the V3.5 record.",
      "Verify the SOP setup requirements.",
      "Confirm that the Control Plan and PFMEA remain applicable.",
      "Monitor OP30 output and OP40 waiting during the trial.",
    ],
    risks: ["Program instability could reduce OP30 throughput or cause an incorrect release decision."],
    assumptions: ["V3.5 is currently a proposed version."],
  },
  "engineering-required-evidence": {
    summary: "At minimum, this engineering change requires a program change record, a V3.5 validation record, SOP consistency confirmation, and Control Plan / PFMEA review. The CTQ Leak Rate release criteria must remain controlled.",
    findings: [
      "Engineering evidence: ECR, program comparison, and Validation Record.",
      "Quality evidence: Control Plan, PFMEA, and CTQ approval.",
      "Production evidence: OP30 trial output and reject rate.",
      "Document evidence: SOP setup confirmation.",
    ],
    recommendedActions: [
      "Create a V3.4 versus V3.5 comparison record.",
      "Complete golden-part, reject-part, and repeatability validation.",
      "Record OP30 trial genealogy.",
      "Obtain joint Engineering and Quality approval.",
    ],
    risks: ["V3.5 cannot be marked as released while the evidence package is incomplete."],
    assumptions: ["The change scope covers only the current M220 deployment at OP30."],
  },
  "engineering-failed-validation": {
    summary: "If validation fails, block the V3.5 release immediately, perform a controlled rollback to V3.4, and assess the impact on OP30 output, Leak Rate decisions, rework and retest load, and waiting before OP40.",
    findings: [
      "Production: OP30 may be unstable or unavailable.",
      "Quality: Products tested with V3.5 require a containment review.",
      "Engineering: V3.5 must not be released, and rollback must be controlled.",
      "Value Stream: Retesting and waiting may increase and create a temporary bottleneck.",
    ],
    recommendedActions: [
      "Stop the V3.5 release.",
      "Roll back to V3.4 through the controlled process.",
      "Identify every part tested with V3.5.",
      "Start containment and retesting.",
      "Record the validation failure and review the PFMEA.",
    ],
    risks: ["Unidentified V3.5 genealogy could result in an incorrect quality release."],
    assumptions: ["V3.4 remains a validated and available version."],
  },
  "bottleneck-op20-hypothesis": {
    summary: "OP20 may be the current route bottleneck because its 48-second cycle time exceeds the 45-second takt while WIP and waiting before OP20 are increasing. This hypothesis still requires validation against shop-floor pace and resource conditions.",
    findings: [
      "Production: OP20 is slower than adjacent OP10 and OP30 and exceeds takt.",
      "Value Stream: WIP and waiting before OP20 are elevated.",
      "Engineering: Manual assembly, fixture reset, and operator availability require investigation.",
      "Quality: OP20 assembly variation may propagate to OP30 Leak Rate results.",
    ],
    recommendedActions: [
      "Compare actual cycle times for OP10, OP20, and OP30.",
      "Review WIP and waiting before OP20.",
      "Review Standard Work for OP20.",
      "Confirm fixture and operator availability.",
      "Check the correlation between OP20 defects and OP30 Leak Rate results.",
    ],
    risks: ["Using cycle time alone could misclassify temporary variation as a sustained bottleneck."],
    assumptions: ["Current takt is 45 seconds, and the scripted sample represents the normal product mix."],
  },
  "bottleneck-quality-shift": {
    summary: "The bottleneck could shift or expand from OP20 to OP30. If a Leak Rate abnormality adds retest loops, OP30 effective capacity falls while rework/retest load and waiting before OP40 rise, creating a temporary quality bottleneck.",
    findings: [
      "Production: OP30 output will decline because of retest loops.",
      "Quality: CTQ Leak Rate must remain controlled before release.",
      "Value Stream: Retest load and OP40 waiting will increase.",
      "Engineering: M220 setup, program, and fixture conditions must be checked to exclude false rejects.",
    ],
    recommendedActions: [
      "Compare OP20 WIP with the OP30 retest queue.",
      "Calculate OP30 effective capacity including retest loops.",
      "Review the OP40 waiting trend.",
      "Confirm the OP30 first-pass failure rate.",
      "Review M220 test stability.",
    ],
    risks: ["A sustained OP20 constraint and a temporary OP30 quality bottleneck may coexist."],
    assumptions: ["The Leak Rate failure and retest signal is above the normal baseline."],
  },
  "bottleneck-data-plan": {
    summary: "Confirming the actual bottleneck requires combined production-pace, WIP, waiting-time, quality-rework, and resource-state data. Cycle Time alone cannot distinguish a sustained OP20 constraint from a temporary OP30 quality bottleneck.",
    findings: [
      "Production data: actual cycle time, output per hour, and downtime.",
      "Value Stream data: WIP and waiting by buffer.",
      "Quality data: first-pass failures, retests, rework, and containment.",
      "Engineering data: M220 version and calibration, plus OP20 standard-work adherence.",
    ],
    recommendedActions: [
      "Create a short-term bottleneck dashboard for OP10, OP20, OP30, and OP40.",
      "Track WIP and waiting by buffer.",
      "Separate first-pass output from retest output.",
      "Compare OP20 capacity loss with OP30 retest load.",
      "Recalculate bottleneck risk after containment.",
    ],
    risks: ["Combining first-pass and retest output will overstate OP30 effective capacity."],
    assumptions: ["All data is aligned to the same time window and product mix."],
  },
  clarification: {
    summary: "I need more context to complete a traceable analysis. Provide at least one operation, machine, quality characteristic, document, or value-stream metric.",
    findings: ["The Semantic Layer could not resolve the request with sufficient confidence."],
    recommendedActions: ["Add at least one explicit manufacturing object or metric."],
    risks: [],
    assumptions: ["The agent does not infer unsupported manufacturing context."],
  },
} satisfies Record<string, LocalizedResponseCopy>;

export function localizeAgentResponse(turnId: string, response: ScriptedAgentResponse, language: AgentLanguage): ScriptedAgentResponse {
  if (language === "zh") return response;
  const localizedCopy = englishResponseCopyByTurnId[turnId as keyof typeof englishResponseCopyByTurnId];
  if (!localizedCopy) throw new Error(`Missing English response copy for scripted turn: ${turnId}`);
  return { ...response, ...localizedCopy };
}
