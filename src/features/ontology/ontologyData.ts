import { ontologyActionTypes, ontologyLinkTypes, ontologyObjectTypes } from "../../data/ontologyData";
import type { OntologyDomain } from "../../types";
import type { OntologyLane, OntologySourceData } from "./ontologyTypes";

export const ontologyLanes: OntologyLane[] = [
  {
    id: "product-material",
    label: "Product & Material",
    domain: "production",
    description: "Product definitions, materials, components, assemblies, and finished product types.",
    objectTypeIds: ["Product", "Material", "Component", "Finished Product"],
    roles: ["Product Engineer", "Planner", "Buyer"],
    questions: ["What is being produced?", "Which materials and components feed the route?"],
    sourceSystems: ["PLM", "ERP"],
  },
  {
    id: "process",
    label: "Process",
    domain: "production",
    description: "Route and operation model defining how product types are manufactured.",
    objectTypeIds: ["Process Route", "Operation", "Process Box"],
    roles: ["Manufacturing Engineer", "Line Planner"],
    questions: ["Which operations build the product?", "How does the route sequence flow?"],
    sourceSystems: ["MES", "PLM", "Lean VSM"],
  },
  {
    id: "resource",
    label: "Resource",
    domain: "engineering",
    description: "Machines, fixtures, programs, and tooling resources required by process steps.",
    objectTypeIds: ["Machine", "Fixture", "Program"],
    roles: ["Manufacturing Engineering", "Automation", "Maintenance"],
    questions: ["Which equipment performs the operation?", "Which fixture or program is required?"],
    sourceSystems: ["MES", "Tooling DB", "Automation Repository"],
  },
  {
    id: "quality",
    label: "Quality",
    domain: "quality",
    description: "Quality characteristics, controls, inspection methods, PFMEA risks, and control plan items.",
    objectTypeIds: ["Quality Characteristic", "Inspection Method", "Control Method", "PFMEA Risk", "Control Plan Item"],
    roles: ["Quality Engineer", "Process Owner"],
    questions: ["Which risks are controlled?", "Can one Operation control multiple quality characteristics?"],
    sourceSystems: ["QMS", "PFMEA", "Control Plan"],
  },
  {
    id: "engineering-document",
    label: "Engineering & Document",
    domain: "engineering",
    description: "Specifications, documents, drawings, versions, and governed engineering definitions.",
    objectTypeIds: ["Engineering Spec", "Document", "Version"],
    roles: ["Manufacturing Engineer", "Document Control"],
    questions: ["Which specification governs this process?", "Which SOP describes the operation?"],
    sourceSystems: ["PLM", "Document Library"],
  },
  {
    id: "value-stream",
    label: "Value Stream",
    domain: "valueStream",
    description: "Inventory, WIP, customer demand, and flow metrics used in value stream analysis.",
    objectTypeIds: ["Supplier", "Inventory Buffer", "WIP Buffer", "Finished Goods Inventory", "Customer", "Value Stream Metric"],
    roles: ["Lean Manager", "Operations Manager"],
    questions: ["Where does WIP accumulate?", "What is the lead-time contribution?"],
    sourceSystems: ["ERP", "MES", "Lean VSM", "BI"],
  },
  {
    id: "governance",
    label: "Governance",
    domain: "shared",
    description: "Source mapping, ownership, versioning, auditability, and release governance.",
    objectTypeIds: ["Source System Mapping", "Owner"],
    roles: ["Data Steward", "Quality System Owner"],
    questions: ["Where did this data come from?", "Who owns and approves this object type?"],
    sourceSystems: ["MES", "PLM", "ERP", "QMS", "Document Library"],
  },
];

export const ontologySourceNodes = ontologyObjectTypes;
export const ontologySourceEdges = ontologyLinkTypes;
export const ontologySourceActions = ontologyActionTypes;

export const ontologySourceData: OntologySourceData = {
  nodes: ontologySourceNodes,
  edges: ontologySourceEdges,
  lanes: ontologyLanes,
  actions: ontologySourceActions,
};

export const domainLabel: Record<OntologyDomain, string> = {
  production: "Production",
  quality: "Quality",
  engineering: "Engineering",
  valueStream: "Value Stream",
  shared: "Document / Governance",
};

export const relationshipGroups = [
  { title: "Structural Relations", relationTypes: ["hasRoute", "contains", "precedes", "requires", "consumes", "produces"] },
  { title: "Resource Relations", relationTypes: ["conductedBy", "requiresFixture", "usesProgram", "runsOn", "mountedOn"] },
  { title: "Quality Relations", relationTypes: ["controls", "inspectedBy", "controlledBy", "referencedBy", "hasRisk", "mitigatedBy", "linkedTo"] },
  { title: "Document Relations", relationTypes: ["describes", "governs", "supports", "definedBy"] },
  { title: "Value Stream Relations", relationTypes: ["feeds", "outputs", "supplies", "measures"] },
  { title: "Governance Relations", relationTypes: ["mappedTo"] },
];

export const domainStyles: Record<OntologyDomain, {
  edge: string;
  border: string;
  borderColor: string;
  softBg: string;
  text: string;
  badge: string;
  filterActive: string;
  filterBorder: string;
  filterText: string;
}> = {
  production: { edge: "#2563eb", border: "border-blue-200", borderColor: "#bfdbfe", softBg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-50 text-blue-700", filterActive: "bg-blue-50 text-blue-700", filterBorder: "border-blue-200", filterText: "text-blue-700" },
  quality: { edge: "#c2410c", border: "border-orange-200", borderColor: "#fed7aa", softBg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-50 text-orange-700", filterActive: "bg-orange-50 text-orange-700", filterBorder: "border-orange-200", filterText: "text-orange-700" },
  engineering: { edge: "#6d28d9", border: "border-violet-200", borderColor: "#ddd6fe", softBg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-50 text-violet-700", filterActive: "bg-violet-50 text-violet-700", filterBorder: "border-violet-200", filterText: "text-violet-700" },
  valueStream: { edge: "#0f766e", border: "border-teal-200", borderColor: "#99f6e4", softBg: "bg-teal-50", text: "text-teal-700", badge: "bg-teal-50 text-teal-700", filterActive: "bg-teal-50 text-teal-700", filterBorder: "border-teal-200", filterText: "text-teal-700" },
  shared: { edge: "#52525b", border: "border-zinc-200", borderColor: "#d4d4d8", softBg: "bg-zinc-100", text: "text-zinc-700", badge: "bg-zinc-100 text-zinc-700", filterActive: "bg-zinc-100 text-zinc-700", filterBorder: "border-zinc-200", filterText: "text-zinc-700" },
};

