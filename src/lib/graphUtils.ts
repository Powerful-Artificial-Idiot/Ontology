import type {
  CompactEdgeLabel,
  CompactEdgeLabels,
  EdgeLabelCategory,
  GraphEdge,
  GraphMetadata,
  SearchResult,
  StackNode,
  StackObject,
  ViewMode,
} from "../types";

export function getTopObject(node: StackNode, viewMode: ViewMode): StackObject {
  if (viewMode === "quality") {
    return getTopQualityObject(node);
  }

  const objectId =
    node.topObjectByView[viewMode] ??
    node.topObjectByView.production ??
    node.topObjectByView.quality ??
    node.topObjectByView.engineering ??
    node.topObjectByView.valueStream;
  return node.stackObjects.find((object) => object.id === objectId) ?? node.stackObjects[0];
}

export function getQualityObjects(node: StackNode): StackObject[] {
  const qualityTypes = new Set([
    "Quality",
    "Quality Characteristic",
    "Inspection",
    "Inspection Method",
    "Control Method",
    "PFMEA",
    "PFMEA Risk",
    "Control Plan Item",
    "Key Characteristic",
    "CTQ",
  ]);

  return node.stackObjects.filter((object) => qualityTypes.has(object.type));
}

export function getKeyQualityObjects(node: StackNode): StackObject[] {
  return getQualityObjects(node).filter(
    (object) =>
      object.qualityMeta?.isKeyCharacteristic ||
      object.qualityMeta?.isCTQ ||
      object.qualityMeta?.severity === "critical" ||
      object.qualityMeta?.severity === "high",
  );
}

export function getQualityBadges(node: StackNode): string[] {
  const qualityObjects = getQualityObjects(node);
  const badges: string[] = [];

  if (qualityObjects.some((object) => object.qualityMeta?.severity === "critical")) {
    badges.push("Critical");
  }
  if (qualityObjects.some((object) => object.qualityMeta?.isCTQ)) {
    badges.push("CTQ");
  }
  if (qualityObjects.some((object) => object.qualityMeta?.isKeyCharacteristic)) {
    badges.push("Key");
  }
  if (qualityObjects.some((object) => object.qualityMeta?.severity === "high")) {
    badges.push("High Risk");
  }

  return badges.slice(0, 2);
}

function getTopQualityObject(node: StackNode): StackObject {
  const qualityObjects = getQualityObjects(node);
  const fallbackObjectId =
    node.topObjectByView.production ??
    node.topObjectByView.quality ??
    node.topObjectByView.engineering ??
    node.topObjectByView.valueStream;
  const fallbackObject =
    node.stackObjects.find((object) => object.id === fallbackObjectId) ?? node.stackObjects[0];

  return (
    qualityObjects.find((object) => object.qualityMeta?.isCTQ) ||
    qualityObjects.find((object) => object.qualityMeta?.isKeyCharacteristic) ||
    qualityObjects.find((object) => object.qualityMeta?.severity === "critical") ||
    qualityObjects.find((object) => object.qualityMeta?.severity === "high") ||
    qualityObjects.find((object) => object.type === "Quality Characteristic" || object.type === "Quality") ||
    qualityObjects.find((object) => object.type === "Inspection" || object.type === "Inspection Method" || object.type === "Control Method") ||
    fallbackObject
  );
}

export function getEdgeMetadata(edge: GraphEdge, viewMode: ViewMode): GraphMetadata {
  return edge.metadataByView[viewMode] ?? edge.metadataByView.production ?? {};
}

export function getCompactEdgeLabels(
  edge: GraphEdge,
  viewMode: ViewMode,
): CompactEdgeLabels {
  const metadata = getEdgeMetadata(edge, viewMode);

  if (viewMode === "production") {
    return {
      top: pickLabel(metadata, [
        labelRule("requiredQty", "partsQty", "Parts Qty", "Quantity of parts required from the upstream node."),
        labelRule("outputQty", "partsQty", "Output Qty", "Quantity of parts produced by this transition."),
        labelRule("batchSize", "batchSize", "Batch Size", "Batch quantity moved through this transition."),
      ]),
      bottom: pickLabel(metadata, [
        labelRule("cycleTime", "cycleTime", "Cycle Time", "Processing time required at this step or transition."),
        labelRule("cycleContribution", "cycleTime", "Cycle Contribution", "Cycle time contribution from this input or transition."),
      ]),
    };
  }

  if (viewMode === "quality") {
    return {
      top: pickLabel(metadata, [
        labelRule("CTQ", "ctq", "Critical To Quality", "Key quality characteristic controlled by this transition."),
        labelRule("inspectionItem", "ctq", "Inspection Item", "Quality item inspected at this transition."),
        labelRule("incomingInspection", "ctq", "Incoming Inspection", "Incoming quality check required before this process step."),
      ]),
      bottom: pickLabel(metadata, [
        labelRule("frequency", "inspectionFrequency", "Inspection Frequency", "How frequently this quality control is performed."),
        labelRule("risk", "qualityRisk", "Quality Risk", "Risk level associated with this quality control point."),
      ]),
    };
  }

  if (viewMode === "valueStream") {
    return {
      top: pickLabel(metadata, [
        labelRule("wipQty", "wip", "WIP Qty", "Work-in-process quantity waiting before the next step."),
        labelRule("inventoryQty", "inventoryQty", "Inventory Qty", "Inventory quantity held in this buffer or inventory point."),
        labelRule("transferBatch", "transferBatch", "Transfer Batch", "Batch quantity transferred to the next value stream step."),
        labelRule("outputBatch", "transferBatch", "Output Batch", "Batch quantity output from the upstream process."),
        labelRule("deliveryFrequency", "customerDemand", "Delivery Frequency", "How often material or finished goods are delivered."),
      ]),
      bottom: pickLabel(metadata, [
        labelRule("waitingTime", "waitingTime", "Waiting Time", "Non-value-added waiting time before the next value stream step."),
        labelRule("inventoryDays", "inventoryDays", "Inventory Days", "Estimated days of inventory coverage at this point."),
        labelRule("customerDemand", "customerDemand", "Customer Demand", "Customer demand rate for the finished product."),
        labelRule("leadTime", "leadTime", "Lead Time", "Total elapsed time contribution in the value stream."),
      ]),
    };
  }

  return {
    top: pickLabel(metadata, [
      labelRule("fixtureDependency", "fixture", "Fixture Dependency", "Fixture required for this process transition."),
      labelRule("materialSpec", "materialSpec", "Material Spec", "Material specification required by this transition."),
      labelRule("programVersion", "program", "Program Version", "Machine or controller program version used in this process."),
    ]),
    bottom: pickLabel(metadata, [
      labelRule("parameter", "processParameter", "Process Parameter", "Key engineering parameter used in this process."),
      labelRule("programVersion", "program", "Program Version", "Machine or controller program version used in this process."),
      labelRule("spec", "spec", "Process Spec", "Engineering specification governing this transition."),
      labelRule("drawing", "drawing", "Drawing", "Engineering drawing referenced by this transition."),
    ]),
  };
}

export function isVisibleInView(item: { visibleInViews?: ViewMode[] }, viewMode: ViewMode): boolean {
  return !item.visibleInViews || item.visibleInViews.includes(viewMode);
}

export function getNodePosition(node: StackNode, viewMode: ViewMode): { x: number; y: number } {
  return node.positionByView?.[viewMode] ?? node.position;
}

export function getFocusedGraphElements(
  allNodes: StackNode[],
  allEdges: GraphEdge[],
  expandedNodeId: string,
  viewMode: ViewMode,
): {
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
} {
  const viewNodeIds = new Set(
    allNodes.filter((node) => isVisibleInView(node, viewMode)).map((node) => node.id),
  );
  const visibleNodeIds = new Set<string>([expandedNodeId]);
  const visibleEdgeIds = new Set<string>();

  for (const edge of allEdges) {
    const edgeVisible =
      isVisibleInView(edge, viewMode) &&
      viewNodeIds.has(edge.source) &&
      viewNodeIds.has(edge.target) &&
      (edge.source === expandedNodeId || edge.target === expandedNodeId);

    if (!edgeVisible) {
      continue;
    }

    visibleEdgeIds.add(edge.id);
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }

  return { visibleNodeIds, visibleEdgeIds };
}

export function toggleExpandNode(expandedNodeIds: Set<string>, nodeId: string): Set<string> {
  const next = new Set(expandedNodeIds);
  if (next.has(nodeId)) {
    next.delete(nodeId);
  } else {
    next.add(nodeId);
  }
  return next;
}

export function selectStackObject(nodes: StackNode[], objectId: string) {
  for (const node of nodes) {
    const object = node.stackObjects.find((stackObject) => stackObject.id === objectId);
    if (object) {
      return { node, object };
    }
  }

  return null;
}

export function searchGraph(nodes: StackNode[], keyword: string): SearchResult {
  const query = keyword.trim().toLowerCase();
  if (!query) {
    return { nodeIds: [], objectIds: [] };
  }

  const result: SearchResult = { nodeIds: [], objectIds: [] };

  for (const node of nodes) {
    const nodeMatches =
      node.id.toLowerCase().includes(query) ||
      node.nodeCategory.toLowerCase().includes(query) ||
      node.stackObjects.some((object) =>
        [
          object.id,
          object.label,
          object.type,
          object.description,
          object.sourceSystem,
          object.sourceId,
          object.version,
          object.owner,
          ...Object.values(object.attributes),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );

    if (nodeMatches) {
      result.nodeIds.push(node.id);
    }

    for (const object of node.stackObjects) {
      const objectText = [
        object.id,
        object.label,
        object.type,
        object.description,
        object.sourceSystem,
        object.sourceId,
        object.version,
        object.owner,
        ...Object.entries(object.attributes).flat(),
      ]
        .join(" ")
        .toLowerCase();

      if (objectText.includes(query)) {
        result.objectIds.push(object.id);
      }
    }
  }

  return result;
}

export function highlightNeighborhood(nodeId: string, edges: GraphEdge[]) {
  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();

  for (const edge of edges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
      edgeIds.add(edge.id);
    }
  }

  return { nodeIds, edgeIds };
}

export function getNodeByObjectId(nodes: StackNode[], objectId: string): StackNode | undefined {
  return nodes.find((node) => node.stackObjects.some((object) => object.id === objectId));
}

export function getObjectById(nodes: StackNode[], objectId: string): StackObject | undefined {
  return selectStackObject(nodes, objectId)?.object;
}

export function getObjectsByType(nodes: StackNode[], type: string): Array<StackObject & { nodeId: string }> {
  return nodes.flatMap((node) =>
    node.stackObjects
      .filter((object) => object.type === type)
      .map((object) => ({ ...object, nodeId: node.id })),
  );
}

export function formatMetadata(metadata: GraphMetadata): string[] {
  return Object.entries(metadata).map(([key, value]) => `${humanizeKey(key)}: ${value}`);
}

export function humanizeKey(key: string): string {
  const specialCases: Record<string, string> = {
    CTQ: "CTQ",
    WIP: "WIP",
    requiredQty: "Qty",
    cycleTime: "CT",
    cycleContribution: "Cycle",
    batchSize: "Batch",
    supplyType: "Supply",
    incomingInspection: "Incoming",
    controlMethod: "Method",
    fixtureDependency: "Fixture",
    programVersion: "Program",
    materialSpec: "Material",
    cameraRecipe: "Camera",
  };

  if (specialCases[key]) {
    return specialCases[key];
  }

  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function toShortLabel(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .replace(/^Test pressure\s+/i, "")
    .replace(/^Force\s+/i, "")
    .replace(/^Position tolerance\s+/i, "")
    .replace(/^LeakTestProgram\s+/i, "LeakTest ")
    .replace(/^(high|medium|low)$/i, (risk) => risk.charAt(0).toUpperCase() + risk.slice(1).toLowerCase())
    .replace(/\s+/g, " ");
}

function labelRule(
  key: string,
  category: EdgeLabelCategory,
  fullLabel: string,
  description: string,
) {
  return { key, category, fullLabel, description };
}

function pickLabel(
  metadata: GraphMetadata,
  rules: Array<ReturnType<typeof labelRule>>,
): CompactEdgeLabel | undefined {
  for (const rule of rules) {
    const value = toShortLabel(metadata[rule.key]);
    if (value) {
      return {
        value,
        category: rule.category,
        fullLabel: rule.fullLabel,
        description: rule.description,
      };
    }
  }

  return undefined;
}
