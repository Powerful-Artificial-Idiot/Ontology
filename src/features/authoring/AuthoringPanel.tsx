import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthoringAuditEvent, AuthoringDiff, AuthoringObjectTypeDefinition, AuthoringRelationOption, EntityMutation, KnowledgeChangeSet, RelationMutation } from "../../../packages/knowledge-contracts/src/index";
import type { StackObject } from "../../types";
import { KnowledgeAuthoringClient, type CanonicalIdAvailability, type PublicKnowledgeChangeSet } from "./knowledgeAuthoringClient";

const tokenKey = "mkg-live-agent-access";

export function AuthoringPanel({ selectedObject, onPublished, onChangeSetsChange }: { selectedObject?: StackObject; onPublished?: (changeSet: PublicKnowledgeChangeSet) => void; onChangeSetsChange?: (changeSets: PublicKnowledgeChangeSet[]) => void }) {
  const [token, setToken] = useState(() => typeof window === "undefined" ? undefined : window.sessionStorage.getItem(tokenKey) ?? undefined);
  const [tokenDraft, setTokenDraft] = useState("");
  const client = useMemo(() => new KnowledgeAuthoringClient(undefined, token), [token]);
  const [types, setTypes] = useState<AuthoringObjectTypeDefinition[]>([]);
  const [relationOptions, setRelationOptions] = useState<AuthoringRelationOption[]>([]);
  const [changeSets, setChangeSets] = useState<PublicKnowledgeChangeSet[]>([]);
  const [active, setActive] = useState<PublicKnowledgeChangeSet>();
  const [audit, setAudit] = useState<AuthoringAuditEvent[]>([]);
  const [diff, setDiff] = useState<AuthoringDiff>();
  const [mode, setMode] = useState<"create" | "edit" | "relation">("create");
  const [canonicalType, setCanonicalType] = useState("Operation");
  const [canonicalId, setCanonicalId] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [owner, setOwner] = useState("Manufacturing Knowledge Owner");
  const [specific, setSpecific] = useState<Record<string, string>>({});
  const [relationType, setRelationType] = useState("");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [idAvailability, setIdAvailability] = useState<CanonicalIdAvailability>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const definition = types.find((item) => item.canonicalType === canonicalType);
  const additionalFields = definition?.fields.filter((field) => !["label", "description", "status", "owner", "sourceSystem"].includes(field.key)) ?? [];

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.getCatalog(), client.list()]).then(([catalog, list]) => {
      if (cancelled) return;
      setTypes(catalog.objectTypes.filter((item) => item.enabled));
      setRelationOptions(catalog.relationOptions);
      setChangeSets(list);
      onChangeSetsChange?.(list);
    }).catch((loadError: unknown) => { if (!cancelled) setError(message(loadError)); });
    return () => { cancelled = true; };
  }, [client, onChangeSetsChange]);

  useEffect(() => {
    if (mode !== "edit" || !selectedObject) return;
    const type = mapStackType(selectedObject.type);
    if (!type) return;
    setCanonicalType(type);
    setCanonicalId(selectedObject.id);
    setLabel(selectedObject.label);
    setDescription(selectedObject.description);
    setVersion(nextVersion(selectedObject.version));
    setOwner(selectedObject.owner);
    setSpecific(Object.fromEntries(Object.entries(selectedObject.attributes).map(([key, value]) => [key, String(value)])));
  }, [mode, selectedObject]);

  useEffect(() => {
    if (mode !== "create" || (!canonicalId.trim() && !label.trim())) { setIdAvailability(undefined); return; }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void client.checkIdAvailability(canonicalType, { canonicalId: canonicalId.trim() || undefined, label: label.trim() || undefined }).then((result) => {
        if (cancelled) return;
        if (!canonicalId.trim() && result.canonicalId) setCanonicalId(result.canonicalId);
        setIdAvailability(result);
      }).catch(() => { if (!cancelled) setIdAvailability(undefined); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [canonicalId, canonicalType, client, label, mode]);

  const selectedCanonicalType = selectedObject ? mapStackType(selectedObject.type) : undefined;
  const availableRelations = relationOptions.filter((option) => option.sourceCanonicalType === selectedCanonicalType);

  useEffect(() => {
    if (mode !== "relation") return;
    setRelationType((current) => availableRelations.some((option) => option.relationType === current) ? current : availableRelations[0]?.relationType ?? "");
  }, [availableRelations, mode]);

  const saveDraft = async () => run(async () => {
    if (mode === "relation") {
      if (!selectedObject || !relationType || !relationTargetId.trim()) throw new Error("Select a source object, governed relation type and target canonical ID.");
      const relationMutation: RelationMutation = {
        operation: "create",
        canonicalId: relationCanonicalId(selectedObject.id, relationType, relationTargetId),
        relationType,
        sourceCanonicalId: selectedObject.id,
        targetCanonicalId: relationTargetId.trim(),
        proposedVersion: "1.0",
      };
      const relationDefinition = relationOptions.find((option) => option.relationType === relationType);
      const result = await client.create({ title: `Connect ${selectedObject.label} to ${relationTargetId.trim()}`, description: relationDefinition?.validationDescription, domain: definitionForType(types, selectedCanonicalType)?.domain ?? "production", entityMutations: [], relationMutations: [relationMutation] });
      setActive(result);
      await reload(result);
      return;
    }
    const editableSpecific = Object.fromEntries(additionalFields.filter((field) => !field.readOnly).map((field) => [field.key, specific[field.key] ?? ""]));
    const mutation = buildMutation(mode, canonicalType, canonicalId, version, label, description, owner, editableSpecific, selectedObject);
    const result = active && ["draft", "changes-requested"].includes(active.status)
      ? await client.update(active.id, { entityMutations: [mutation] })
      : await client.create({ title: `${mode === "create" ? "Create" : "Update"} ${label}`, description: "Governed knowledge authoring request from Route Explorer.", domain: definition?.domain ?? "production", entityMutations: [mutation], relationMutations: [] });
    setActive(result);
    await reload(result);
  });

  const act = (action: Parameters<KnowledgeAuthoringClient["action"]>[1]) => run(async () => {
    if (!active) return;
    const result = await client.action(active.id, action, action === "request-changes" || action === "reject" ? "Governed review feedback from Route Explorer." : undefined);
    setActive(result);
    await reload(result);
    if (result.status === "published") onPublished?.(result);
  });

  const reload = async (current: PublicKnowledgeChangeSet) => {
    const [list, events, serverDiff] = await Promise.all([client.list(), client.audit(current.id).catch(() => []), client.diff(current.id).catch(() => undefined)]);
    setChangeSets(list);
    onChangeSetsChange?.(list);
    setAudit(events);
    setDiff(serverDiff);
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(undefined);
    try { await operation(); } catch (operationError) { setError(message(operationError)); } finally { setBusy(false); }
  };

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="Governed knowledge authoring workspace">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Authoring Mode</div><div className="mt-1 text-base font-bold text-slate-950">Governed Knowledge Change</div></div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">Phase 5E</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">Draft knowledge is isolated until validation, submission, approval and publication complete.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!token && import.meta.env.VITE_AGENT_MODE === "api" && (
          <section className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <label className="text-xs font-bold text-amber-900">Access token</label>
            <div className="mt-2 flex gap-2"><input type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} className="min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs" /><button type="button" onClick={() => { window.sessionStorage.setItem(tokenKey, tokenDraft); setToken(tokenDraft); }} className="rounded-md bg-amber-900 px-3 text-xs font-bold text-white">Use</button></div>
          </section>
        )}
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" onClick={() => { setMode("create"); setActive(undefined); }} className={tab(mode === "create")}>Add object</button>
          <button type="button" disabled={!selectedObject || !mapStackType(selectedObject.type)} onClick={() => { setMode("edit"); setActive(undefined); }} className={tab(mode === "edit")}>Edit selected</button>
          <button type="button" disabled={!selectedObject || !mapStackType(selectedObject.type)} onClick={() => { setMode("relation"); setActive(undefined); }} className={tab(mode === "relation")}>Add relation</button>
        </div>
        {mode === "relation" ? (
          <section className="space-y-3">
            <Field label="Source object"><input value={selectedObject ? `${selectedObject.label} · ${selectedObject.id}` : "Select a graph object"} disabled className={control()} /></Field>
            <Field label="Ontology relation"><select value={relationType} onChange={(event) => setRelationType(event.target.value)} className={control()} disabled={!availableRelations.length}>{availableRelations.map((option) => <option key={option.relationType} value={option.relationType}>{option.label} · {option.targetCanonicalType}</option>)}</select></Field>
            <Field label="Target canonical ID" note={availableRelations.find((option) => option.relationType === relationType)?.targetCanonicalType}><input value={relationTargetId} onChange={(event) => setRelationTargetId(event.target.value)} placeholder="canonical target ID" className={control()} /></Field>
            {availableRelations.find((option) => option.relationType === relationType) && <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] leading-4 text-slate-500">{availableRelations.find((option) => option.relationType === relationType)?.validationDescription}</div>}
            {!availableRelations.length && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">No outbound governed relation is enabled for this object type.</div>}
            <button type="button" disabled={busy || !selectedObject || !relationType || !relationTargetId.trim()} onClick={() => void saveDraft()} className="w-full rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Create relation change set</button>
          </section>
        ) : <section className="space-y-3">
          <Field label="Object type"><select value={canonicalType} onChange={(event) => { setCanonicalType(event.target.value); setSpecific({}); }} disabled={mode === "edit"} className={control()}>{types.map((item) => <option key={item.canonicalType} value={item.canonicalType}>{item.label}</option>)}</select></Field>
          <Field label="Canonical ID"><input value={canonicalId} onChange={(event) => setCanonicalId(event.target.value)} disabled={mode === "edit"} placeholder={definition ? `${definition.idPrefix}.stable-id` : "stable.id"} className={control()} /></Field>
          {mode === "create" && idAvailability && <div className={`text-[11px] font-semibold ${idAvailability.available ? "text-emerald-700" : "text-red-700"}`}>{idAvailability.available ? "Canonical ID is available" : idAvailability.issues[0]?.message ?? "Canonical ID is not available"}</div>}
          <Field label="Label"><input value={label} onChange={(event) => setLabel(event.target.value)} className={control()} /></Field>
          <Field label="Description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={control()} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Proposed version"><input value={version} onChange={(event) => setVersion(event.target.value)} className={control()} /></Field><Field label="Owner"><input value={owner} onChange={(event) => setOwner(event.target.value)} className={control()} /></Field></div>
          {additionalFields.map((field) => <Field key={field.key} label={field.label} note={field.readOnly ? `${field.owner?.toUpperCase()} managed` : undefined}><input value={specific[field.key] ?? ""} onChange={(event) => setSpecific((values) => ({ ...values, [field.key]: event.target.value }))} disabled={field.readOnly} className={control()} /></Field>)}
          <button type="button" disabled={busy || !canonicalId || !label} onClick={() => void saveDraft()} className="w-full rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{active ? "Update draft" : "Create change set"}</button>
        </section>}

        {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
        {active && <WorkflowCard changeSet={active} busy={busy} onAction={act} />}
        {diff && (diff.entities.length > 0 || diff.relations.length > 0) && <section className="mt-5 border-t border-slate-200 pt-4"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Field-level Diff</div><div className="space-y-2">{diff.entities.map((entity) => <div key={entity.canonicalId} className="rounded-md border border-slate-200 bg-slate-50 p-2"><div className="text-xs font-bold text-slate-800">{entity.canonicalId} · {entity.changeType}</div>{entity.fields.map((field) => <div key={field.field} className="mt-1 grid grid-cols-[90px_1fr] gap-2 text-[10px]"><span className="font-semibold text-slate-500">{field.field}</span><span className="truncate text-slate-700">{String(field.before ?? "-")} → {String(field.after ?? "-")}</span></div>)}</div>)}</div></section>}

        <section className="mt-5 border-t border-slate-200 pt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Change Sets</div>
          <div className="space-y-2">{changeSets.slice().reverse().map((item) => <button type="button" key={item.id} onClick={() => { setActive(item); void reload(item); }} className="w-full rounded-md border border-slate-200 p-2 text-left hover:border-slate-400"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-bold text-slate-800">{item.title}</span><Status status={item.status} /></div><div className="mt-1 text-[10px] text-slate-400">{item.revision} · {item.domain}</div></button>)}</div>
        </section>
        {audit.length > 0 && <section className="mt-5 border-t border-slate-200 pt-4"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Audit Trail</div><div className="space-y-2">{audit.slice().reverse().map((event) => <div key={event.id} className="border-l-2 border-emerald-200 pl-3 text-[11px]"><div className="font-bold text-slate-700">{event.action.replace(/^AUTHORING_/u, "").replace(/_/gu, " ")}</div><div className="text-slate-400">{event.actorId} · {new Date(event.occurredAt).toLocaleString()}</div></div>)}</div></section>}
      </div>
    </aside>
  );
}

function WorkflowCard({ changeSet, busy, onAction }: { changeSet: PublicKnowledgeChangeSet; busy: boolean; onAction: (action: Parameters<KnowledgeAuthoringClient["action"]>[1]) => void }) {
  return <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"><div className="flex items-center justify-between"><div className="text-xs font-bold text-slate-900">{changeSet.title}</div><Status status={changeSet.status} /></div>{changeSet.validationResult && <div className="mt-2"><div className={`text-xs font-semibold ${changeSet.validationResult.valid ? "text-emerald-700" : "text-red-700"}`}>{changeSet.validationResult.valid ? "Validation passed" : `${changeSet.validationResult.issues.length} validation issue(s)`}</div>{changeSet.validationResult.issues.length > 0 && <div className="mt-2 space-y-1">{changeSet.validationResult.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className={`rounded border px-2 py-1.5 text-[10px] leading-4 ${issue.severity === "blocking" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><span className="font-bold">{issue.code}</span> · {issue.message}</div>)}</div>}</div>}<div className="mt-3 grid grid-cols-2 gap-2">{actionsFor(changeSet.status).map((action) => <button type="button" key={action} disabled={busy} onClick={() => onAction(action)} className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-[11px] font-bold capitalize text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">{action.replace(/-/gu, " ")}</button>)}</div><div className="mt-3 text-[10px] leading-4 text-slate-500">No transition bypass: submit, approve and publish remain separate audited actions.</div></section>;
}

function buildMutation(mode: "create" | "edit", canonicalType: string, canonicalId: string, proposedVersion: string, label: string, description: string, owner: string, specific: Record<string, string>, selectedObject?: StackObject): EntityMutation {
  const properties = { label: label.trim(), description: description.trim(), status: "active", owner: owner.trim(), ...Object.fromEntries(Object.entries(specific).filter(([, value]) => value.trim())) };
  return mode === "create"
    ? { operation: "create", canonicalId: canonicalId.trim(), canonicalType, proposedVersion, properties, ownershipMode: "manual" }
    : { operation: "update", canonicalId: canonicalId.trim(), canonicalType, expectedCurrentVersion: selectedObject?.version ?? "1", proposedVersion, changedProperties: properties };
}
function relationCanonicalId(sourceId: string, relationType: string, targetId: string): string { return `relation.${sourceId}.${relationType.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.${targetId.trim()}`; }
function definitionForType(types: AuthoringObjectTypeDefinition[], canonicalType?: string): AuthoringObjectTypeDefinition | undefined { return types.find((item) => item.canonicalType === canonicalType); }
function actionsFor(status: KnowledgeChangeSet["status"]): Array<Parameters<KnowledgeAuthoringClient["action"]>[1]> { if (status === "draft" || status === "changes-requested") return ["validate", "submit", "withdraw"]; if (status === "submitted") return ["approve", "request-changes", "reject"]; if (status === "approved") return ["publish", "withdraw-approval"]; return []; }
function mapStackType(type: string): string | undefined { return ({ Product: "Product", Operation: "Operation", Machine: "Machine", "Quality Characteristic": "QualityCharacteristic", "Engineering Change": "EngineeringChange", "PFMEA Risk": "FailureMode" } as Record<string, string>)[type]; }
function nextVersion(version: string): string { const value = Number(version); return Number.isFinite(value) ? (value + 0.1).toFixed(1) : `${version}.1`; }
function tab(active: boolean): string { return `rounded-md px-3 py-2 text-xs font-bold transition disabled:opacity-40 ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`; }
function control(): string { return "w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400"; }
function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) { return <label className="block"><span className="mb-1 flex justify-between text-[11px] font-bold text-slate-600"><span>{label}</span>{note && <span className="font-semibold text-slate-400">{note}</span>}</span>{children}</label>; }
function Status({ status }: { status: KnowledgeChangeSet["status"] }) { return <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{status}</span>; }
function message(error: unknown): string { return error instanceof Error ? error.message : "Knowledge authoring operation failed."; }
