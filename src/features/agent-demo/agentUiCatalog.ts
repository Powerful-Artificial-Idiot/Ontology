import type { AgentReferenceType, AgentToolName } from "./agentDemoTypes";

export const agentToolCatalog: Array<{ id: AgentToolName; label: string; role: string }> = [
  { id: "contextResolver", label: "Context Resolver", role: "Carry governed entities and assumptions across turns." },
  { id: "semanticResolver", label: "Semantic Resolver", role: "Resolve business language to governed terms." },
  { id: "ontologyMapper", label: "Ontology Mapper", role: "Map terms to object types and relationships." },
  { id: "knowledgeRetriever", label: "Knowledge Retriever", role: "Retrieve connected manufacturing instances." },
  { id: "crossViewIndexer", label: "Cross-view Indexer", role: "Index findings across production, quality, engineering and value-stream views." },
  { id: "evidenceFinder", label: "Evidence Finder", role: "Collect approved records and source evidence." },
  { id: "answerComposer", label: "Answer Composer", role: "Compose a structured, cited conclusion." },
];

export const agentSourceCatalog: Array<{ type: AgentReferenceType; description: string }> = [
  { type: "Semantic Catalog", description: "Governed terms, aliases and business definitions." },
  { type: "Ontology", description: "Allowed object types and relationship semantics." },
  { type: "Route Graph", description: "Product route and connected manufacturing instances." },
  { type: "Control Plan", description: "Inspection controls, frequencies and reaction plans." },
  { type: "PFMEA", description: "Failure modes, risk ratings and mitigations." },
  { type: "SOP", description: "Approved operating and validation procedures." },
  { type: "Engineering Spec", description: "Released parameters and program requirements." },
  { type: "MES Mock Data", description: "Scripted production timing and equipment records." },
  { type: "QMS Mock Data", description: "Scripted quality results and deviation records." },
  { type: "Value Stream Map", description: "Flow, WIP, waiting time and capacity evidence." },
  { type: "Line Balance Study", description: "Industrial engineering capacity and work-content analysis." },
  { type: "Standard Work", description: "Released operation sequence and expected work content." },
  { type: "Engineering Change Request", description: "Governed change scope, affected objects and approvals." },
  { type: "Validation Record", description: "Controlled verification results and approvals." },
];
