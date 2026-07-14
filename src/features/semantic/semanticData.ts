import type {
  SemanticConceptBundle,
  SemanticDomain,
  SemanticEntity,
  SemanticEntityType,
  SemanticMapping,
  SemanticRelation,
} from "./semanticTypes";

interface ConceptDefinition {
  id: string;
  title: string;
  domain: SemanticDomain;
  summary: string;
  aliases: string[];
  ontology: Array<{ label: string; type?: "ontologyObject" | "ontologyProperty" | "ontologyRelationship"; description?: string }>;
  fields: Array<{ label: string; system: string; dataType: string; unit?: string; refresh?: string }>;
  evidence: Array<{ label: string; documentType: string; version?: string; system: string; validFrom?: string; validTo?: string }>;
  metric?: string;
  owner: string;
  routeUsage: string[];
  resolvedMeaning: string;
  relevantObjects: string[];
  actions: string[];
  promptContext: string;
  ambiguityNotes?: string[];
}

const definitions: ConceptDefinition[] = [
  {
    id: "cycle-time",
    title: "Cycle Time",
    domain: "production",
    summary: "Nominal processing time required by an operation or value stream process box.",
    aliases: ["CT", "C/T", "Processing Time", "Operation Time"],
    ontology: [
      { label: "Operation.cycleTime", type: "ontologyProperty", description: "Nominal duration property of an Operation." },
      { label: "ValueStreamMetric.processTime", type: "ontologyProperty", description: "Observed process time used in value stream analysis." },
    ],
    fields: [
      { label: "MES.operation_cycle_time", system: "MES", dataType: "duration", unit: "seconds", refresh: "Master data release" },
      { label: "MES.standard_cycle_time", system: "MES", dataType: "duration", unit: "seconds", refresh: "Daily" },
    ],
    evidence: [
      { label: "Routing Sheet", documentType: "Routing", version: "Rev.C", system: "PLM" },
      { label: "Standard Work", documentType: "Work Standard", version: "Rev.B", system: "DMS" },
      { label: "MES Master Data", documentType: "System Record", system: "MES" },
    ],
    metric: "Operation Cycle Time",
    owner: "Industrial Engineering",
    routeUsage: ["Production View edge label", "Value Stream View process box"],
    resolvedMeaning: "Processing time required by an operation under the current production standard.",
    relevantObjects: ["Operation", "Process Box", "Value Stream Metric", "Machine"],
    actions: ["Compare actual and standard cycle time", "Identify takt time violations", "Trace route timing evidence", "Calculate capacity impact"],
    promptContext: "When the user says cycle time, resolve to Operation.cycleTime in production context. In value stream analysis, also consider ValueStreamMetric.processTime and distinguish processing time from total lead time.",
    ambiguityNotes: ["CT can mean Cycle Time in production context or be confused with CTQ in quality context."],
  },
  {
    id: "leak-rate",
    title: "Leak Rate",
    domain: "quality",
    summary: "Quality characteristic measured during the OP30 automatic leak test.",
    aliases: ["Leakage", "Air Leak", "Leak Value", "Leak Test Result"],
    ontology: [
      { label: "QualityCharacteristic.LeakRate", type: "ontologyProperty" },
      { label: "Inspection.OP30LeakTest", type: "ontologyObject" },
      { label: "Operation.OP30", type: "ontologyObject" },
      { label: "Machine.M220LeakTestBench", type: "ontologyObject" },
    ],
    fields: [
      { label: "QMS.inspection_result.leak_rate", system: "QMS", dataType: "decimal", unit: "sccm", refresh: "Per inspection" },
      { label: "MES.op30_test_value", system: "MES", dataType: "decimal", unit: "sccm", refresh: "Real time" },
    ],
    evidence: [
      { label: "Control Plan CP-BB01 Rev.A", documentType: "Control Plan", version: "Rev.A", system: "QMS" },
      { label: "PFMEA PF-BB01 Rev.B", documentType: "PFMEA", version: "Rev.B", system: "QMS" },
      { label: "SOP OP30 Leak Test", documentType: "SOP", version: "Rev.C", system: "DMS" },
    ],
    metric: "Leak Test Result",
    owner: "Quality Engineering",
    routeUsage: ["Quality View", "OP30 Leak Test node", "Quality object in stacked node"],
    resolvedMeaning: "Quality characteristic measured during OP30 Leak Test to validate booster sealing performance.",
    relevantObjects: ["Operation: OP30 Leak Test", "Machine: M220 Leak Test Bench", "Quality Characteristic: Leak Rate", "Control Method: 100% leak test", "Source Document: Control Plan CP-BB01 Rev.A"],
    actions: ["Trace abnormal leak rate", "Find related PFMEA risks", "Compare historical defect trend", "Generate 8D context"],
    promptContext: "When the user mentions leak rate, resolve it to QualityCharacteristic.LeakRate. Use QMS.inspection_result.leak_rate and MES.op30_test_value as primary fields. Use Control Plan CP-BB01 Rev.A and PFMEA PF-BB01 Rev.B as evidence.",
  },
  {
    id: "ctq",
    title: "CTQ",
    domain: "quality",
    summary: "A quality characteristic formally classified as critical to customer or regulatory requirements.",
    aliases: ["Critical to Quality", "Key Characteristic", "Critical Characteristic"],
    ontology: [
      { label: "QualityCharacteristic.isCritical", type: "ontologyProperty" },
      { label: "ControlPlan.criticalCharacteristic", type: "ontologyProperty" },
      { label: "PFMEA.specialCharacteristic", type: "ontologyProperty" },
    ],
    fields: [
      { label: "QMS.characteristic.is_ctq", system: "QMS", dataType: "boolean", refresh: "On approval" },
      { label: "PLM.special_characteristic_flag", system: "PLM", dataType: "boolean", refresh: "On release" },
    ],
    evidence: [
      { label: "Control Plan", documentType: "Control Plan", system: "QMS" },
      { label: "PFMEA", documentType: "PFMEA", system: "QMS" },
      { label: "Drawing Special Characteristic Mark", documentType: "Drawing", system: "PLM" },
    ],
    owner: "Quality Systems",
    routeUsage: ["Quality View characteristic badge", "Stacked quality object"],
    resolvedMeaning: "A quality characteristic marked as critical and requiring governed control evidence.",
    relevantObjects: ["Quality Characteristic", "Control Plan Item", "PFMEA Risk", "Engineering Drawing"],
    actions: ["List CTQ controls", "Find missing inspection evidence", "Trace special characteristic approval", "Assess change impact"],
    promptContext: "Resolve CTQ to a Quality Characteristic with isCritical set to true. Validate against the Control Plan, PFMEA and drawing special-characteristic mark before using the classification.",
    ambiguityNotes: ["If the user says CT, determine whether the context is production Cycle Time or quality CTQ."],
  },
  {
    id: "defect-mode",
    title: "Defect Mode",
    domain: "quality",
    summary: "Observed or anticipated way a product or process fails to meet a requirement.",
    aliases: ["Failure Mode", "Defect Type", "Nonconformance Mode"],
    ontology: [{ label: "PFMEARisk.failureMode", type: "ontologyProperty" }, { label: "QualityEvent.defectCode", type: "ontologyProperty" }],
    fields: [{ label: "QMS.nonconformance.defect_code", system: "QMS", dataType: "string", refresh: "Per event" }, { label: "MES.scrap_reason", system: "MES", dataType: "enum", refresh: "Real time" }],
    evidence: [{ label: "PFMEA Failure Mode Register", documentType: "PFMEA", system: "QMS" }, { label: "Nonconformance Record", documentType: "Quality Record", system: "QMS" }],
    owner: "Plant Quality",
    routeUsage: ["Quality risk detail", "OP40 Final Inspection"],
    resolvedMeaning: "Named failure pattern associated with a quality event, inspection result or PFMEA risk.",
    relevantObjects: ["PFMEA Risk", "Quality Event", "Inspection", "Operation"],
    actions: ["Find affected operations", "Compare defect frequency", "Trace containment actions", "Prepare Pareto context"],
    promptContext: "Resolve defect mode using the governed PFMEA failure mode and QMS defect code. Do not merge distinct defect codes solely because their free-text descriptions are similar.",
  },
  {
    id: "bottleneck",
    title: "Bottleneck",
    domain: "valueStream",
    summary: "Constraint that limits throughput based on cycle time, capacity, WIP and waiting time.",
    aliases: ["Constraint", "Capacity Constraint", "Line Bottleneck"],
    ontology: [{ label: "ValueStreamMetric.bottleneck", type: "ontologyProperty" }, { label: "Operation.capacityConstraint", type: "ontologyProperty" }, { label: "Machine.capacityLimit", type: "ontologyProperty" }],
    fields: [{ label: "MES.operation_capacity", system: "MES", dataType: "decimal", unit: "pcs/hour", refresh: "Hourly" }, { label: "MES.actual_cycle_time", system: "MES", dataType: "duration", unit: "seconds", refresh: "Real time" }, { label: "IE.line_balance_result", system: "IE", dataType: "decimal", unit: "%", refresh: "Per study" }],
    evidence: [{ label: "Value Stream Map", documentType: "VSM", system: "Lean VSM" }, { label: "Line Balance Study", documentType: "IE Study", system: "IE" }, { label: "Capacity Calculation", documentType: "Capacity Model", system: "IE" }],
    metric: "Constraint Utilization",
    owner: "Industrial Engineering",
    routeUsage: ["Value Stream bottleneck marker", "Process box capacity detail"],
    resolvedMeaning: "Current process, resource or supply constraint limiting end-to-end throughput.",
    relevantObjects: ["Operation", "Machine", "WIP Buffer", "Value Stream Metric"],
    actions: ["Rank capacity constraints", "Compare WIP accumulation", "Simulate line balance", "Trace supporting study"],
    promptContext: "When the user says bottleneck, compare operation cycle time, available capacity, WIP accumulation and waiting time. Consider operation, machine, labor skill and material supply constraints.",
  },
  {
    id: "wip",
    title: "WIP",
    domain: "valueStream",
    summary: "Work-in-process inventory waiting or moving between manufacturing operations.",
    aliases: ["Work in Process", "In-process Inventory", "Queue Inventory"],
    ontology: [{ label: "WIPBuffer.inventoryQty", type: "ontologyProperty" }, { label: "Operation.outputs", type: "ontologyRelationship" }],
    fields: [{ label: "MES.wip_quantity", system: "MES", dataType: "integer", unit: "pcs", refresh: "Real time" }, { label: "ERP.in_process_stock", system: "ERP", dataType: "integer", unit: "pcs", refresh: "Hourly" }],
    evidence: [{ label: "WIP Transaction Log", documentType: "System Record", system: "MES" }, { label: "Value Stream Map", documentType: "VSM", system: "Lean VSM" }],
    metric: "WIP Quantity",
    owner: "Production Control",
    routeUsage: ["Value Stream WIP buffer", "Production View WIP edge metadata"],
    resolvedMeaning: "Quantity of unfinished product between or within operations at a specified time.",
    relevantObjects: ["WIP Buffer", "Operation", "Material Lot", "Value Stream Metric"],
    actions: ["Locate WIP accumulation", "Calculate inventory days", "Trace lot genealogy", "Compare queue aging"],
    promptContext: "Resolve WIP as work-in-process inventory, retaining the operation boundary, timestamp, unit and lot scope. Do not treat finished goods inventory as WIP.",
  },
  {
    id: "lead-time",
    title: "Lead Time",
    domain: "valueStream",
    summary: "Elapsed time from demand or material release through completion, including waiting.",
    aliases: ["Throughput Time", "Flow Time", "End-to-end Time"],
    ontology: [{ label: "ValueStreamMetric.leadTime", type: "ontologyProperty" }, { label: "ProcessRoute.elapsedTime", type: "ontologyProperty" }],
    fields: [{ label: "BI.route_lead_time", system: "BI", dataType: "duration", unit: "hours", refresh: "Daily" }, { label: "MES.order_elapsed_time", system: "MES", dataType: "duration", unit: "hours", refresh: "Per order" }],
    evidence: [{ label: "Value Stream Map", documentType: "VSM", system: "Lean VSM" }, { label: "Production Order History", documentType: "System Record", system: "MES" }],
    metric: "Route Lead Time",
    owner: "Operations Excellence",
    routeUsage: ["Value Stream summary", "Route timing analysis"],
    resolvedMeaning: "Total elapsed time through the selected route scope, including processing, transport and waiting.",
    relevantObjects: ["Process Route", "Operation", "WIP Buffer", "Customer Demand"],
    actions: ["Decompose value-added time", "Find waiting hotspots", "Compare route variants", "Trace order history"],
    promptContext: "Resolve lead time using the requested start and end boundaries. Include waiting and transport unless the user explicitly requests processing time only.",
    ambiguityNotes: ["Lead time is not equivalent to cycle time. It includes waiting and other non-processing intervals."],
  },
  {
    id: "control-method",
    title: "Control Method",
    domain: "quality",
    summary: "Prevention or detection method used to control a quality characteristic or PFMEA risk.",
    aliases: ["Quality Control", "Prevention Control", "Detection Control"],
    ontology: [{ label: "ControlMethod", type: "ontologyObject" }, { label: "QualityCharacteristic.controlledBy", type: "ontologyRelationship" }, { label: "PFMEARisk.mitigatedBy", type: "ontologyRelationship" }],
    fields: [{ label: "QMS.control_plan.control_method", system: "QMS", dataType: "string", refresh: "On approval" }, { label: "QMS.pfmea.current_control", system: "QMS", dataType: "string", refresh: "On approval" }],
    evidence: [
      { label: "Control Plan CP-001 V2", documentType: "Control Plan", version: "V2", system: "QMS", validFrom: "2025-01-01", validTo: "2026-03-14" },
      { label: "Control Plan CP-001 V3", documentType: "Control Plan", version: "V3", system: "QMS", validFrom: "2026-03-15" },
      { label: "PFMEA PF-BB01 Rev.B", documentType: "PFMEA", version: "Rev.B", system: "QMS" },
      { label: "Inspection Work Instruction", documentType: "Work Instruction", system: "DMS" },
    ],
    owner: "Quality Engineering",
    routeUsage: ["Quality View detail", "Stacked Control Method object"],
    resolvedMeaning: "Governed prevention or detection control applied to a quality characteristic or process risk.",
    relevantObjects: ["Control Method", "Quality Characteristic", "PFMEA Risk", "Inspection Method"],
    actions: ["Trace controlled risks", "Find inspection frequency", "Check evidence coverage", "Assess control change impact"],
    promptContext: "Resolve control method to the approved Control Plan or PFMEA control. Distinguish the control method from the inspection result and from the characteristic being controlled.",
  },
];

const entities: SemanticEntity[] = [];
const mappings: SemanticMapping[] = [];
const bundles: SemanticConceptBundle[] = [];

definitions.forEach((definition) => {
  const primaryId = `${definition.id}-term`;
  const entityIds: string[] = [];
  const mappingIds: string[] = [];
  const addEntity = (entity: Omit<SemanticEntity, "conceptId">) => {
    entities.push({ ...entity, conceptId: definition.id });
    entityIds.push(entity.id);
  };
  const addMapping = (sourceId: string, targetId: string, relation: SemanticRelation, label: string) => {
    const id = `${definition.id}-${relation}-${mappingIds.length + 1}`;
    mappings.push({ id, conceptId: definition.id, sourceId, targetId, relation, label, description: `${label} semantic mapping for ${definition.title}.`, confidence: "high" });
    mappingIds.push(id);
  };

  addEntity({ id: primaryId, label: definition.title, type: "businessTerm", domain: definition.domain, description: definition.summary, aliases: definition.aliases, owner: definition.owner, status: "approved", confidence: "approved", relatedOntologyObjects: definition.relevantObjects, usedInRouteExplorer: definition.routeUsage });

  definition.aliases.forEach((alias, index) => {
    const id = `${definition.id}-alias-${index + 1}`;
    addEntity({ id, label: alias, type: "synonym", domain: definition.domain, description: `Accepted business-language alias for ${definition.title}.`, owner: definition.owner, status: "reviewed", confidence: index === 0 ? "high" : "medium", examples: definition.ambiguityNotes });
    addMapping(id, primaryId, "synonymOf", "synonymOf");
  });

  if (definition.metric) {
    const id = `${definition.id}-metric`;
    addEntity({ id, label: definition.metric, type: "metric", domain: definition.domain, description: `Governed metric representation of ${definition.title}.`, owner: definition.owner, status: "approved", confidence: "high" });
    addMapping(primaryId, id, "means", "means");
  }

  const ontologyIds = definition.ontology.map((item, index) => {
    const id = `${definition.id}-ontology-${index + 1}`;
    const type: SemanticEntityType = item.type ?? "ontologyProperty";
    addEntity({ id, label: item.label, type, domain: definition.domain, description: item.description ?? `Ontology mapping for ${definition.title}.`, owner: "Enterprise Ontology Team", status: "approved", confidence: "approved", usedInRouteExplorer: definition.routeUsage });
    addMapping(primaryId, id, type === "ontologyObject" ? "mapsToObject" : type === "ontologyRelationship" ? "mapsToRelationship" : "mapsToProperty", "mapsTo");
    return id;
  });

  const fieldIds = definition.fields.map((field, index) => {
    const id = `${definition.id}-field-${index + 1}`;
    addEntity({ id, label: field.label, type: "systemField", domain: definition.domain, description: `${field.system} field mapped to ${definition.title}.`, owner: definition.owner, status: "approved", confidence: "high", sourceSystems: [field.system], dataType: field.dataType, unit: field.unit, attributes: { "Refresh Frequency": field.refresh ?? "On change", "Mapped Term": definition.title } });
    addMapping(ontologyIds[index % ontologyIds.length], id, "storedIn", "storedIn");
    return id;
  });

  const evidenceIds = definition.evidence.map((evidence, index) => {
    const id = `${definition.id}-evidence-${index + 1}`;
    addEntity({
      id,
      label: evidence.label,
      type: "sourceEvidence",
      domain: definition.domain,
      description: `${evidence.documentType} providing governed evidence for ${definition.title}.`,
      owner: definition.owner,
      status: "approved",
      confidence: "approved",
      sourceSystems: [evidence.system],
      sourceDocuments: [evidence.label],
      attributes: {
        "Document Type": evidence.documentType,
        Version: evidence.version ?? "Current",
        "Approval Status": "Approved",
        ...(evidence.validFrom ? { "Valid From": evidence.validFrom } : {}),
        ...(evidence.validTo ? { "Valid To": evidence.validTo } : {}),
      },
    });
    addMapping(fieldIds[index % fieldIds.length], id, "evidencedBy", "evidencedBy");
    return id;
  });

  const aiId = `${definition.id}-ai-context`;
  addEntity({ id: aiId, label: `${definition.title} Agent Context`, type: "aiContext", domain: definition.domain, description: definition.resolvedMeaning, owner: "Enterprise AI Governance", status: "reviewed", confidence: "high", sourceDocuments: definition.evidence.map((item) => item.label), relatedOntologyObjects: definition.relevantObjects, attributes: { "Evidence Coverage": `${evidenceIds.length} governed sources`, "Available Actions": String(definition.actions.length) }, examples: definition.ambiguityNotes });
  evidenceIds.forEach((id) => addMapping(id, aiId, "usedByAgent", "usedByAgent"));

  bundles.push({
    id: definition.id,
    primaryTermId: primaryId,
    title: definition.title,
    domain: definition.domain,
    summary: definition.summary,
    entityIds,
    mappingIds,
    aiContext: {
      resolvedMeaning: definition.resolvedMeaning,
      relevantObjects: definition.relevantObjects,
      availableActions: definition.actions,
      promptContext: definition.promptContext,
      ambiguityNotes: definition.ambiguityNotes,
      evidenceCoverage: `${definition.evidence.length} approved evidence sources`,
    },
  });
});

export const semanticEntities = entities;
export const semanticMappings = mappings;
export const semanticConceptBundles = bundles;

export const semanticEntityById = new Map(semanticEntities.map((entity) => [entity.id, entity]));
export const semanticMappingById = new Map(semanticMappings.map((mapping) => [mapping.id, mapping]));
export const semanticConceptById = new Map(semanticConceptBundles.map((bundle) => [bundle.id, bundle]));

export const semanticDomainLabels: Record<SemanticDomain, string> = {
  production: "Production",
  quality: "Quality",
  engineering: "Engineering",
  valueStream: "Value Stream",
  governance: "Governance",
};
