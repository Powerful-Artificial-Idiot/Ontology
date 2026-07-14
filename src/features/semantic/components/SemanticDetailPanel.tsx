import { ArrowUpRight, Bot, Database, FileCheck2, Languages } from "lucide-react";
import type { ReactNode } from "react";
import type { AppPage } from "../../../types";
import { semanticDomainLabels, semanticEntityById, semanticMappingById } from "../semanticData";
import type { SemanticConceptBundle, SemanticEntity } from "../semanticTypes";

export function SemanticDetailPanel({ entity, bundle, onPageChange }: { entity?: SemanticEntity; bundle?: SemanticConceptBundle; onPageChange: (page: AppPage) => void }) {
  if (!entity || !bundle) return <aside className="flex w-[380px] shrink-0 items-center justify-center border-l border-slate-200 bg-white p-6 text-sm text-slate-400">Select a semantic entity.</aside>;
  const mappings = bundle.mappingIds.map((id) => semanticMappingById.get(id)).filter(Boolean);
  const connectedIds = new Set<string>();
  mappings.forEach((mapping) => { if (mapping?.sourceId === entity.id) connectedIds.add(mapping.targetId); if (mapping?.targetId === entity.id) connectedIds.add(mapping.sourceId); });
  const connected = Array.from(connectedIds).map((id) => semanticEntityById.get(id)).filter((item): item is SemanticEntity => Boolean(item));
  const fieldRows: Array<[string, string]> = [
    ["Field Name", entity.label],
    ["Source System", entity.sourceSystems?.join(", ") ?? "Unmapped"],
    ["Data Type", entity.dataType ?? "string"],
    ["Unit", entity.unit ?? "Not applicable"],
    ...Object.entries(entity.attributes ?? {}),
  ];
  const evidenceRows: Array<[string, string]> = [
    ["Document Name", entity.label],
    ["Source System", entity.sourceSystems?.join(", ") ?? "Unmapped"],
    ...Object.entries(entity.attributes ?? {}),
    ["Owner", entity.owner ?? "Unassigned"],
  ];
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Semantic Detail</div><div className="mt-1 flex items-center gap-2"><DetailIcon entity={entity} /><span className="truncate text-sm font-bold text-slate-950">{entity.label}</span></div></div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="space-y-5">
          <DetailSection title="Definition"><p className="text-sm leading-6 text-slate-600">{entity.description}</p></DetailSection>
          <DetailSection title="Semantic Governance"><KeyValues rows={[["Type", formatType(entity.type)], ["Domain", semanticDomainLabels[entity.domain]], ["Owner", entity.owner ?? "Unassigned"], ["Status", entity.status ?? "draft"], ["Confidence", entity.confidence ?? "medium"]]} /></DetailSection>
          {entity.type === "businessTerm" ? <><DetailSection title="Synonyms"><Chips values={entity.aliases ?? []} /></DetailSection>{bundle.aiContext.ambiguityNotes?.length ? <DetailSection title="Ambiguity Notes"><Notes values={bundle.aiContext.ambiguityNotes} /></DetailSection> : null}</> : null}
          {entity.type === "synonym" ? <><DetailSection title="Preferred Term"><Chips values={[semanticEntityById.get(bundle.primaryTermId)?.label ?? bundle.title]} /></DetailSection><DetailSection title="Context and Ambiguity"><Notes values={entity.examples?.length ? entity.examples : [`Use ${entity.label} only within the ${semanticDomainLabels[entity.domain]} context.`]} /></DetailSection></> : null}
          {entity.type === "systemField" ? <DetailSection title="Field Mapping"><KeyValues rows={fieldRows} /></DetailSection> : null}
          {entity.type === "sourceEvidence" ? <DetailSection title="Evidence Record"><KeyValues rows={evidenceRows} /></DetailSection> : null}
          {entity.type === "aiContext" ? <><DetailSection title="Resolved Meaning"><p className="text-sm leading-6 text-slate-600">{bundle.aiContext.resolvedMeaning}</p></DetailSection><DetailSection title="Available Actions"><Notes values={bundle.aiContext.availableActions} /></DetailSection><DetailSection title="Evidence Coverage"><Chips values={[bundle.aiContext.evidenceCoverage]} /></DetailSection></> : null}
          {["ontologyObject", "ontologyProperty", "ontologyRelationship"].includes(entity.type) ? <><DetailSection title="Ontology Connection"><KeyValues rows={[["Ontology Element", entity.label], ["Object Type", formatType(entity.type)], ["Related Business Term", bundle.title]]} /></DetailSection><button type="button" onClick={() => onPageChange("ontology")} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-500 active:scale-[0.98]">View in Ontology Explorer<ArrowUpRight className="h-3.5 w-3.5" /></button></> : null}
          <DetailSection title="Connected Semantic Entities">{connected.length ? <div className="space-y-2">{connected.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="text-xs font-bold text-slate-900">{item.label}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-500">{formatType(item.type)}</div></div>)}</div> : <div className="text-xs text-slate-400">No direct semantic mapping.</div>}</DetailSection>
          {entity.usedInRouteExplorer?.length ? <DetailSection title="Used in Route Explorer"><Notes values={entity.usedInRouteExplorer} /></DetailSection> : null}
          {entity.relatedOntologyObjects?.length ? <DetailSection title="Related Ontology Objects"><Chips values={entity.relatedOntologyObjects} /></DetailSection> : null}
        </div>
      </div>
    </aside>
  );
}

function DetailIcon({ entity }: { entity: SemanticEntity }) {
  if (entity.type === "businessTerm" || entity.type === "synonym") return <Languages className="h-4 w-4 text-blue-600" />;
  if (entity.type === "systemField") return <Database className="h-4 w-4 text-violet-600" />;
  if (entity.type === "sourceEvidence") return <FileCheck2 className="h-4 w-4 text-teal-600" />;
  return <Bot className="h-4 w-4 text-indigo-600" />;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>{children}</section>; }
function KeyValues({ rows }: { rows: Array<[string, string]> }) { return <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">{rows.map(([key, value]) => <div key={key} className="flex justify-between gap-3 text-xs"><span className="font-semibold text-slate-500">{key}</span><span className="max-w-[220px] break-words text-right font-bold text-slate-800">{value}</span></div>)}</div>; }
function Chips({ values }: { values: string[] }) { return values.length ? <div className="flex flex-wrap gap-2">{values.map((value) => <span key={value} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{value}</span>)}</div> : <span className="text-xs text-slate-400">No mapped values.</span>; }
function Notes({ values }: { values: string[] }) { return <div className="space-y-2">{values.map((value) => <div key={value} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium leading-5 text-slate-600">{value}</div>)}</div>; }
function formatType(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2"); }
