import type { ReactNode } from "react";
import { Target } from "lucide-react";
import type { OntologyLinkType, OntologyObjectType, OntologyProperty } from "../../../types";
import { domainLabel, domainStyles } from "../ontologyData";
import { laneByObjectId } from "../ontologyLayout";
import type { OntologyEntity, OntologyFocusState, OntologyInteractionState, OntologySourceData } from "../ontologyTypes";
import { getPriorityProperties } from "./OntologyNode";

export function OntologyDetailPanel({ source, interaction, onSelect, onFocus }: { source: OntologySourceData; interaction: OntologyInteractionState; onSelect: (entity: OntologyEntity | null) => void; onFocus: (focus: OntologyFocusState) => void }) {
  const entity = interaction.selectedEntity ?? interaction.hoveredEntity;
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Ontology Detail</div>
        <div className="mt-1 truncate text-sm font-bold text-slate-950">{entity ? describeEntity(entity, source) : "No entity selected"}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!entity ? <EmptyDetail source={source} interaction={interaction} /> : null}
        {entity?.kind === "node" ? <ObjectDetail source={source} objectType={findNode(source, entity.id)} onSelect={onSelect} onFocus={() => onFocus({ mode: "node-focus", nodeId: entity.id })} /> : null}
        {entity?.kind === "property" ? <PropertyDetail objectType={findNode(source, entity.objectTypeId)} propertyId={entity.propertyId} /> : null}
        {entity?.kind === "edge" ? <EdgeDetail edge={findEdge(source, entity.id)} onFocus={(relationshipType) => onFocus({ mode: "relationship-focus", relationshipType })} /> : null}
        {entity?.kind === "relationshipType" ? <RelationshipDetail source={source} relationshipType={entity.id} onSelect={onSelect} onFocus={() => onFocus({ mode: "relationship-focus", relationshipType: entity.id })} /> : null}
        {entity?.kind === "lane" ? <LaneDetail source={source} laneId={entity.id} onSelect={onSelect} onFocus={() => onFocus({ mode: "lane-focus", laneId: entity.id })} /> : null}
        {entity?.kind === "action" ? <ActionDetail source={source} actionId={entity.id} onSelect={onSelect} /> : null}
      </div>
    </aside>
  );
}

function EmptyDetail({ source, interaction }: { source: OntologySourceData; interaction: OntologyInteractionState }) {
  return (
    <div className="space-y-5">
      <DetailSection title="Purpose">
        <p className="text-sm leading-6 text-slate-600">This page defines the object types, properties, and relationship types allowed in the manufacturing knowledge graph.</p>
      </DetailSection>
      <DetailSection title="Interaction Model">
        <div className="grid gap-2 text-sm leading-5 text-slate-600">
          <div className="rounded-lg bg-slate-50 p-3">Hover previews related ontology elements without changing visibility.</div>
          <div className="rounded-lg bg-slate-50 p-3">Click pins a selection and opens its governed definition.</div>
          <div className="rounded-lg bg-slate-50 p-3">Double click or use a Focus action to isolate an explicit scope.</div>
        </div>
      </DetailSection>
      <DetailSection title="Current Scope"><KeyValueRows rows={[["Domain Filter", interaction.domainFilter], ["Object Types", String(source.nodes.length)], ["Relationships", String(source.edges.length)], ["Lanes", String(source.lanes.length)]]} /></DetailSection>
    </div>
  );
}

function ObjectDetail({ source, objectType, onSelect, onFocus }: { source: OntologySourceData; objectType: OntologyObjectType; onSelect: (entity: OntologyEntity) => void; onFocus: () => void }) {
  const inbound = source.edges.filter((edge) => edge.targetObjectType === objectType.id);
  const outbound = source.edges.filter((edge) => edge.sourceObjectType === objectType.id);
  const lane = source.lanes.find((item) => item.id === laneByObjectId.get(objectType.id));
  return (
    <div className="space-y-5">
      <FocusAction label="Focus Object" onClick={onFocus} />
      <DetailSection title="Object Type"><p className="text-sm leading-6 text-slate-600">{objectType.description}</p></DetailSection>
      <DetailSection title="Definition"><KeyValueRows rows={[["Lane", lane?.label ?? "Unmapped"], ["Domain", domainLabel[objectType.domain]], ["Status", objectType.status ?? "active"], ["Properties", String(objectType.properties.length)]]} /></DetailSection>
      <DetailSection title="Ontology Artifact"><KeyValueRows rows={[["Semantic IRI", objectType.semanticIri ?? "Unmapped"], ["Formal Label", objectType.semanticLabel ?? objectType.label], ["Module", objectType.semanticModule ?? "Unknown"], ["Version", objectType.semanticVersion ?? "Unknown"]]} /></DetailSection>
      <DetailSection title="Key Attributes">
        <div className="grid gap-2">
          {getPriorityProperties(objectType).slice(0, 8).map((property) => (
            <button key={property.id} type="button" onClick={() => onSelect({ kind: "property", objectTypeId: objectType.id, propertyId: property.id })} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-400 hover:bg-white active:scale-[0.99]">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-900">{property.name}</span><span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{property.dataType}</span></div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{property.description}</p>
            </button>
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Incoming Relationships"><LinkList links={inbound} onSelect={onSelect} /></DetailSection>
      <DetailSection title="Outgoing Relationships"><LinkList links={outbound} onSelect={onSelect} /></DetailSection>
      <DetailSection title="Source Systems"><ChipList values={objectType.sourceSystems} /></DetailSection>
      <DetailSection title="Instance Examples"><ExampleList values={objectType.examples ?? []} /></DetailSection>
    </div>
  );
}

function PropertyDetail({ objectType, propertyId }: { objectType: OntologyObjectType; propertyId: string }) {
  const property = objectType.properties.find((item) => item.id === propertyId) ?? objectType.properties[0];
  return <div className="space-y-5"><DetailSection title="Property"><KeyValueRows rows={[["Object Type", objectType.label], ["Property", property.name], ["Data Type", property.dataType], ["Required", property.required ? "Yes" : "No"], ["Source System", property.sourceSystem ?? "Inherited"], ["Example", property.example ?? "Not mapped"], ["Semantic Category", property.semanticCategory ?? "General"]]} /></DetailSection><DetailSection title="Ontology Artifact"><KeyValueRows rows={[["Semantic IRI", property.semanticIri ?? "Unmapped"], ["Module", property.semanticModule ?? "Unknown"], ["Status", property.deprecated ? "Deprecated compatibility term" : "Active compatibility term"], ["Replacement", property.replacementIris?.join(", ") || "Pending domain review"]]} /></DetailSection><DetailSection title="Description"><p className="text-sm leading-6 text-slate-600">{property.description}</p></DetailSection></div>;
}

function EdgeDetail({ edge, onFocus }: { edge: OntologyLinkType; onFocus: (relationshipType: string) => void }) {
  return (
    <div className="space-y-5">
      <FocusAction label="Focus Relationship" onClick={() => onFocus(edge.label)} />
      <DetailSection title="Relationship Type"><KeyValueRows rows={[["Source", edge.sourceObjectType], ["Relationship", edge.label], ["Target", edge.targetObjectType], ["Cardinality", edge.cardinality], ["Domain", domainLabel[edge.domain]]]} /></DetailSection>
      <DetailSection title="Business Meaning"><p className="text-sm leading-6 text-slate-600">{edge.description}</p></DetailSection>
      <DetailSection title="Ontology Artifact"><KeyValueRows rows={[["Semantic IRI", edge.semanticIri ?? "Unmapped"], ["Formal Label", edge.semanticLabel ?? edge.label], ["Module", edge.semanticModule ?? "Unknown"]]} /></DetailSection>
      <DetailSection title="Link Properties"><PropertyList properties={edge.properties ?? []} /></DetailSection>
      <DetailSection title="Examples"><ExampleList values={edge.examples ?? []} /></DetailSection>
    </div>
  );
}

function RelationshipDetail({ source, relationshipType, onSelect, onFocus }: { source: OntologySourceData; relationshipType: string; onSelect: (entity: OntologyEntity) => void; onFocus: () => void }) {
  const links = source.edges.filter((edge) => edge.label === relationshipType);
  return <div className="space-y-5"><FocusAction label="Focus Relationship" onClick={onFocus} /><DetailSection title="Relationship Type"><KeyValueRows rows={[["Label", relationshipType], ["Definitions", String(links.length)], ["Domains", Array.from(new Set(links.map((edge) => domainLabel[edge.domain]))).join(", ")]]} /></DetailSection><DetailSection title="Definitions"><LinkList links={links} onSelect={onSelect} /></DetailSection></div>;
}

function LaneDetail({ source, laneId, onSelect, onFocus }: { source: OntologySourceData; laneId: string; onSelect: (entity: OntologyEntity) => void; onFocus: () => void }) {
  const lane = source.lanes.find((item) => item.id === laneId) ?? source.lanes[0];
  const links = source.edges.filter((edge) => lane.objectTypeIds.includes(edge.sourceObjectType) || lane.objectTypeIds.includes(edge.targetObjectType));
  return <div className="space-y-5"><FocusAction label="Focus Lane" onClick={onFocus} /><DetailSection title="Domain"><p className="text-sm leading-6 text-slate-600">{lane.description}</p></DetailSection><DetailSection title="Included Object Types"><ChipList values={lane.objectTypeIds} onClick={(id) => onSelect({ kind: "node", id })} /></DetailSection><DetailSection title="Primary Relationships"><LinkList links={links.slice(0, 10)} onSelect={onSelect} /></DetailSection><DetailSection title="Business Roles"><ChipList values={lane.roles} /></DetailSection><DetailSection title="Typical Questions"><ExampleList values={lane.questions} /></DetailSection><DetailSection title="Source Systems"><ChipList values={lane.sourceSystems} /></DetailSection></div>;
}

function ActionDetail({ source, actionId, onSelect }: { source: OntologySourceData; actionId: string; onSelect: (entity: OntologyEntity) => void }) {
  const action = source.actions.find((item) => item.id === actionId) ?? source.actions[0];
  return <div className="space-y-5"><DetailSection title="Action"><p className="text-sm leading-6 text-slate-600">{action.description}</p></DetailSection><DetailSection title="Applies To"><ChipList values={action.appliesTo} onClick={(id) => onSelect({ kind: "node", id })} /></DetailSection><DetailSection title="Affected Object Types"><ChipList values={action.affectedObjectTypes} onClick={(id) => onSelect({ kind: "node", id })} /></DetailSection></div>;
}

function FocusAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="flex justify-end"><button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-500 active:scale-[0.98]"><Target className="h-3.5 w-3.5" />{label}</button></div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>{children}</section>;
}

function KeyValueRows({ rows }: { rows: Array<[string, string]> }) {
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">{rows.map(([key, value]) => <div key={key} className="flex justify-between gap-3 text-xs"><span className="font-semibold text-slate-500">{key}</span><span className="text-right font-bold text-slate-800">{value}</span></div>)}</div>;
}

function LinkList({ links, onSelect }: { links: readonly OntologyLinkType[]; onSelect: (entity: OntologyEntity) => void }) {
  if (!links.length) return <EmptyText>No mapped relationships.</EmptyText>;
  return <div className="space-y-2">{links.map((link) => <button type="button" key={link.id} onClick={() => onSelect({ kind: "edge", id: link.id })} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99]"><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-900">{link.label}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${domainStyles[link.domain].badge}`}>{domainLabel[link.domain]}</span></div><div className="mt-1 text-xs font-semibold text-slate-500">{link.sourceObjectType} -&gt; {link.targetObjectType}</div></button>)}</div>;
}

function PropertyList({ properties }: { properties: readonly OntologyProperty[] }) {
  if (!properties.length) return <EmptyText>No link-specific properties.</EmptyText>;
  return <div className="space-y-2">{properties.map((property) => <div key={property.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex justify-between gap-2"><span className="text-sm font-bold text-slate-900">{property.name}</span><span className="text-[10px] font-bold text-slate-500">{property.dataType}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{property.description}</p></div>)}</div>;
}

function ChipList({ values, onClick }: { values: readonly string[]; onClick?: (value: string) => void }) {
  if (!values.length) return <EmptyText>No values mapped.</EmptyText>;
  return <div className="flex flex-wrap gap-2">{values.map((value) => <button type="button" key={value} onClick={() => onClick?.(value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-500 active:scale-[0.98]">{value}</button>)}</div>;
}

function ExampleList({ values }: { values: readonly string[] }) {
  if (!values.length) return <EmptyText>No examples mapped.</EmptyText>;
  return <div className="space-y-2">{values.map((value) => <div key={value} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{value}</div>)}</div>;
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-400">{children}</div>;
}

function findNode(source: OntologySourceData, id: string) {
  return source.nodes.find((node) => node.id === id) ?? source.nodes[0];
}

function findEdge(source: OntologySourceData, id: string) {
  return source.edges.find((edge) => edge.id === id) ?? source.edges[0];
}

function describeEntity(entity: OntologyEntity, source: OntologySourceData) {
  if (entity.kind === "node") return entity.id;
  if (entity.kind === "edge") { const edge = findEdge(source, entity.id); return `${edge.sourceObjectType} ${edge.label} ${edge.targetObjectType}`; }
  if (entity.kind === "lane") return source.lanes.find((lane) => lane.id === entity.id)?.label ?? entity.id;
  if (entity.kind === "relationshipType") return `Relationship: ${entity.id}`;
  if (entity.kind === "property") return `${entity.objectTypeId}.${entity.propertyId.replace(/^prop-/, "")}`;
  return source.actions.find((action) => action.id === entity.id)?.label ?? entity.id;
}
