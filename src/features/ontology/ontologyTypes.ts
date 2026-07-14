import type { OntologyActionType, OntologyDomain, OntologyFilter, OntologyLinkType, OntologyObjectType } from "../../types";

export type OntologyEntity =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "lane"; id: string }
  | { kind: "relationshipType"; id: string }
  | { kind: "property"; objectTypeId: string; propertyId: string }
  | { kind: "action"; id: string };

export type OntologyFocusState =
  | { mode: "normal" }
  | { mode: "node-focus"; nodeId: string }
  | { mode: "lane-focus"; laneId: string }
  | { mode: "relationship-focus"; relationshipType: string };

export type OntologyHighlightMode = "direct" | "upstreamDownstream" | "domain";

export type OntologyVisualState =
  | "default"
  | "hovered"
  | "selected"
  | "related"
  | "highlighted"
  | "focused"
  | "dimmed";

export interface OntologyInteractionState {
  hoveredEntity: OntologyEntity | null;
  selectedEntity: OntologyEntity | null;
  focusState: OntologyFocusState;
  domainFilter: OntologyFilter;
  highlightMode: OntologyHighlightMode;
}

export interface OntologyScope {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  laneIds: Set<string>;
}

export interface OntologyLane {
  id: string;
  label: string;
  domain: OntologyDomain;
  description: string;
  objectTypeIds: string[];
  roles: string[];
  questions: string[];
  sourceSystems: string[];
}

export interface OntologySearchResult {
  objectIds: Set<string>;
  edgeIds: Set<string>;
  relationTypes: Set<string>;
  laneIds: Set<string>;
  actionIds: Set<string>;
  propertyIdsByObject: Map<string, Set<string>>;
}

export interface OntologySourceData {
  nodes: readonly OntologyObjectType[];
  edges: readonly OntologyLinkType[];
  lanes: readonly OntologyLane[];
  actions: readonly OntologyActionType[];
}

export interface OntologyNodeData {
  objectType: OntologyObjectType;
  visualState: OntologyVisualState;
  expanded: boolean;
  highlightedPropertyIds: Set<string>;
  inboundCount: number;
  outboundCount: number;
  onToggleExpand: (objectTypeId: string) => void;
  onSelectProperty: (objectTypeId: string, propertyId: string) => void;
  onFocus: (objectTypeId: string) => void;
  onHover: (entity: OntologyEntity) => void;
  onLeave: (entity: OntologyEntity) => void;
}

export interface OntologyEdgeData {
  linkType: OntologyLinkType;
  visualState: OntologyVisualState;
  onHover: (entity: OntologyEntity) => void;
  onLeave: (entity: OntologyEntity) => void;
}

export type OntologyInteractionAction =
  | { type: "hover"; entity: OntologyEntity }
  | { type: "leave"; entity: OntologyEntity }
  | { type: "clear-hover" }
  | { type: "select"; entity: OntologyEntity | null }
  | { type: "focus"; focus: OntologyFocusState }
  | { type: "filter"; filter: OntologyFilter }
  | { type: "highlight-mode"; mode: OntologyHighlightMode }
  | { type: "reset" };
