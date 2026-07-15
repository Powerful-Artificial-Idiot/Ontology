import { agentDemoScenarios } from "../../features/agent-demo/agentDemoData";
import { scriptedTurnsByScenario } from "../../features/agent-demo/agentConversationData";
import { semanticEntities } from "../../features/semantic/semanticData";
import { ontologyLinkTypes, ontologyObjectTypes } from "../ontologyData";
import { stackNodes } from "../mockGraph";
import { validateMockKnowledgeRegistry } from "./validators";

export const mockKnowledgeValidationReport = validateMockKnowledgeRegistry({ scenarios: agentDemoScenarios, scriptedTurns: Object.values(scriptedTurnsByScenario).flat(), routeNodes: stackNodes, semanticEntities, ontologyObjectTypes, ontologyLinkTypes });

export function reportMockKnowledgeValidation() {
  if (mockKnowledgeValidationReport.passed) return;
  for (const issue of mockKnowledgeValidationReport.issues) {
    const log = issue.severity === "error" ? console.error : console.warn;
    log("[Mock Knowledge Validation]", issue.message);
  }
}
