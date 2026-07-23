import type { ComponentType } from "react";

export type ViewMode = "production" | "quality" | "engineering" | "valueStream";
export type AppPage = "route" | "ontology" | "semantic" | "agent";
export type OntologyDomain = "production" | "quality" | "engineering" | "valueStream" | "shared";
export type OntologyFilter = "all" | OntologyDomain;
export type OntologySelectionKind = "object" | "property" | "link" | "relationshipType" | "lane" | "action" | "empty";

export type StackObjectType =
  | "Product"
  | "Material"
  | "Component"
  | "Process"
  | "Operation"
  | "Machine"
  | "Fixture"
  | "Quality"
  | "Quality Characteristic"
  | "Document"
  | "Engineering Spec"
  | "Program"
  | "Inspection"
  | "Inspection Method"
  | "Control Method"
  | "Specification"
  | "Control Limit"
  | "Measurement System"
  | "Metric Observation"
  | "Reaction Plan"
  | "Engineering Change"
  | "Governed Document"
  | "PFMEA"
  | "PFMEA Risk"
  | "Control Plan Item"
  | "Key Characteristic"
  | "CTQ"
  | "Supplier"
  | "Customer"
  | "Inventory Buffer"
  | "WIP Buffer"
  | "FIFO Lane"
  | "Supermarket"
  | "Process Box"
  | "Bottleneck Marker"
  | "Value Stream Metric"
  | "Finished Goods Inventory";

export type NodeCategory =
  | "raw-material"
  | "component"
  | "operation"
  | "finished-product"
  | "supplier"
  | "customer"
  | "inventory"
  | "wip-buffer"
  | "value-stream";

export type GraphMetadata = Record<string, string>;

export type EdgeLabelCategory =
  | "partsQty"
  | "cycleTime"
  | "batchSize"
  | "wip"
  | "ctq"
  | "inspectionFrequency"
  | "qualityRisk"
  | "fixture"
  | "program"
  | "processParameter"
  | "materialSpec"
  | "drawing"
  | "spec"
  | "inventoryQty"
  | "waitingTime"
  | "inventoryDays"
  | "customerDemand"
  | "transferBatch"
  | "leadTime"
  | "valueAddedTime"
  | "nonValueAddedTime"
  | "other";

export interface CompactEdgeLabel {
  value: string;
  category: EdgeLabelCategory;
  fullLabel: string;
  description?: string;
}

export interface CompactEdgeLabels {
  top?: CompactEdgeLabel;
  bottom?: CompactEdgeLabel;
}

export interface StackObjectVisual {
  kind: "thumbnail" | "icon";
  src?: string;
  icon?: string;
  alt?: string;
}

export interface VisualConfig {
  kind: "thumbnail" | "icon";
  icon?: ComponentType<{ className?: string; strokeWidth?: string | number }>;
  src?: string;
  label: string;
  className: string;
  backgroundClassName: string;
}

export interface MetadataByView {
  production?: GraphMetadata;
  quality?: GraphMetadata;
  engineering?: GraphMetadata;
  valueStream?: GraphMetadata;
}

export interface TopObjectByView {
  production?: string;
  quality?: string;
  engineering?: string;
  valueStream?: string;
}

export interface StackObject {
  id: string;
  label: string;
  type: StackObjectType;
  description: string;
  sourceSystem: string;
  sourceId: string;
  version: string;
  owner: string;
  lastUpdated: string;
  attributes: Record<string, string>;
  visual?: StackObjectVisual;
  qualityMeta?: {
    isKeyCharacteristic?: boolean;
    isCTQ?: boolean;
    severity?: "low" | "medium" | "high" | "critical";
    controlMethod?: string;
    inspectionFrequency?: string;
    specification?: string;
    reactionPlan?: string;
    pfmeaRef?: string;
    controlPlanRef?: string;
  };
  relatedObjectIds?: string[];
}

export interface StackNode {
  id: string;
  position: {
    x: number;
    y: number;
  };
  positionByView?: Partial<Record<ViewMode, { x: number; y: number }>>;
  stackObjects: StackObject[];
  topObjectByView: TopObjectByView;
  nodeCategory: NodeCategory;
  visibleInViews?: ViewMode[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  visibleInViews?: ViewMode[];
  metadataByView: MetadataByView;
}

export interface SearchResult {
  nodeIds: string[];
  objectIds: string[];
}

export interface StackNodeRenderData {
  stackNode: StackNode;
  viewMode: ViewMode;
  expanded: boolean;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onToggleExpand: (nodeId: string) => void;
  onSelectStackObject: (nodeId: string, objectId: string) => void;
}

export interface OntologyProperty {
  id: string;
  name: string;
  label: string;
  dataType: "string" | "number" | "boolean" | "date" | "enum" | "duration" | "reference";
  description: string;
  required?: boolean;
  sourceSystem?: string;
  example?: string;
  semanticCategory?: string;
  semanticIri?: string;
  semanticModule?: string;
  deprecated?: boolean;
  replacementIris?: string[];
}

export interface OntologyObjectType {
  id: string;
  label: string;
  description: string;
  domain: OntologyDomain;
  sourceSystems: string[];
  properties: OntologyProperty[];
  examples?: string[];
  status?: "draft" | "active" | "deprecated";
  badges?: string[];
  semanticIri?: string;
  semanticLabel?: string;
  semanticModule?: string;
  semanticVersion?: string;
}

export interface OntologyLinkType {
  id: string;
  label: string;
  sourceObjectType: string;
  targetObjectType: string;
  cardinality: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  description: string;
  domain: OntologyDomain;
  properties?: OntologyProperty[];
  examples?: string[];
  semanticIri?: string;
  semanticLabel?: string;
  semanticModule?: string;
}

export interface OntologyActionType {
  id: string;
  label: string;
  description: string;
  appliesTo: string[];
  affectedObjectTypes: string[];
  affectedLinkTypes?: string[];
  domain: OntologyDomain;
}

export interface OntologyNodeRenderData {
  objectType: OntologyObjectType;
  expanded: boolean;
  selected: boolean;
  related: boolean;
  focused: boolean;
  highlighted: boolean;
  dimmed: boolean;
  highlightedPropertyIds: Set<string>;
  inboundCount: number;
  outboundCount: number;
  onToggleExpand: (objectTypeId: string) => void;
  onSelectProperty: (objectTypeId: string, propertyId: string) => void;
  onHoverEnter: (objectTypeId: string) => void;
  onHoverLeave: (objectTypeId: string) => void;
}
