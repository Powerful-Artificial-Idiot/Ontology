import type {
  AuthoringObjectTypeDefinition,
  AuthoringRelationOption,
  EntityMutation,
} from "../../knowledge-contracts/src/index";

const commonFields: AuthoringObjectTypeDefinition["fields"] = [
  { key: "label", label: "Label", dataType: "string", required: true, readOnly: false, source: "ontology", owner: "manual" },
  { key: "description", label: "Description", dataType: "string", required: false, readOnly: false, source: "ontology", owner: "manual" },
  { key: "status", label: "Lifecycle Status", dataType: "enum", required: true, readOnly: false, source: "authoring-config", enumValues: ["active", "inactive"], owner: "manual" },
  { key: "owner", label: "Business Owner", dataType: "string", required: true, readOnly: false, source: "authoring-config", owner: "manual" },
  { key: "sourceSystem", label: "Source System", dataType: "enum", required: false, readOnly: true, source: "contract", enumValues: ["MES", "PLM", "QMS", "Manual"], owner: "manual" },
];

const typeSpecificFields: Record<string, AuthoringObjectTypeDefinition["fields"]> = {
  Product: [{ key: "productFamily", label: "Product Family", dataType: "string", required: false, readOnly: false, source: "ontology", owner: "manual" }],
  Operation: [
    { key: "operationCode", label: "Operation Code", dataType: "string", required: true, readOnly: false, source: "ontology", owner: "manual" },
    { key: "cycleTimeSeconds", label: "Cycle Time (s)", dataType: "number", required: false, readOnly: true, source: "contract", owner: "mes" },
  ],
  Machine: [
    { key: "machineCode", label: "Machine Code", dataType: "string", required: true, readOnly: false, source: "ontology", owner: "manual" },
    { key: "sourceStatus", label: "Source Status", dataType: "string", required: false, readOnly: true, source: "contract", owner: "mes" },
  ],
  QualityCharacteristic: [
    { key: "unit", label: "Unit", dataType: "string", required: true, readOnly: false, source: "ontology", owner: "manual" },
    { key: "specification", label: "Specification", dataType: "string", required: false, readOnly: true, source: "contract", owner: "qms" },
  ],
  FailureMode: [{ key: "severity", label: "Severity", dataType: "number", required: false, readOnly: true, source: "contract", owner: "qms" }],
  EngineeringChange: [
    { key: "changeNumber", label: "Change Number", dataType: "string", required: true, readOnly: false, source: "ontology", owner: "manual" },
    { key: "proposedProgramVersion", label: "Proposed Program Version", dataType: "string", required: false, readOnly: true, source: "contract", owner: "plm" },
  ],
};

const definitions: Array<Omit<AuthoringObjectTypeDefinition, "fields">> = [
  { canonicalType: "Product", label: "Product", domain: "production", idPrefix: "product", ontologyIri: "https://example.com/mkg/manufacturing#Product", enabled: true },
  { canonicalType: "Operation", label: "Operation", domain: "production", idPrefix: "operation", ontologyIri: "https://example.com/mkg/manufacturing#Operation", enabled: true },
  { canonicalType: "Machine", label: "Machine", domain: "production", idPrefix: "machine", ontologyIri: "https://example.com/mkg/manufacturing#Machine", enabled: true },
  { canonicalType: "QualityCharacteristic", label: "Quality Characteristic", domain: "quality", idPrefix: "quality-characteristic", ontologyIri: "https://example.com/mkg/quality#QualityCharacteristic", enabled: true },
  { canonicalType: "FailureMode", label: "Failure Mode", domain: "quality", idPrefix: "failure-mode", ontologyIri: "https://example.com/mkg/quality#FailureMode", enabled: true },
  { canonicalType: "EngineeringChange", label: "Engineering Change", domain: "engineering", idPrefix: "engineering-change", ontologyIri: "https://example.com/mkg/engineering#EngineeringChange", enabled: true },
];

export const authoringObjectTypes: AuthoringObjectTypeDefinition[] = definitions.map((definition) => ({
  ...definition,
  fields: [...commonFields, ...(typeSpecificFields[definition.canonicalType] ?? [])],
}));

export const authoringRelationOptions: AuthoringRelationOption[] = [
  relation("requiresOperation", "https://example.com/mkg/manufacturing#requiresOperation", "Requires operation", "Product", "Operation"),
  relation("executedBy", "https://example.com/mkg/manufacturing#executedBy", "Executed by", "Operation", "Machine"),
  relation("controlsCharacteristic", "https://example.com/mkg/quality#controlsCharacteristic", "Controls characteristic", "Operation", "QualityCharacteristic"),
  relation("mayAffect", "https://example.com/mkg/quality#mayAffect", "May affect", "FailureMode", "QualityCharacteristic"),
  relation("affectsOperation", "https://example.com/mkg/engineering#affects", "Affects operation", "EngineeringChange", "Operation"),
  relation("affectsMachine", "https://example.com/mkg/engineering#affects", "Affects machine", "EngineeringChange", "Machine"),
  relation("affectsQualityCharacteristic", "https://example.com/mkg/engineering#affects", "Affects quality characteristic", "EngineeringChange", "QualityCharacteristic"),
];

export const sourceOwnedFields = new Set(
  authoringObjectTypes.flatMap((definition) => definition.fields.filter((field) => field.readOnly).map((field) => field.key)),
);

export function getAuthoringType(canonicalType: string): AuthoringObjectTypeDefinition | undefined {
  return authoringObjectTypes.find((definition) => definition.canonicalType === canonicalType);
}

export function getAuthoringRelation(relationType: string): AuthoringRelationOption | undefined {
  return authoringRelationOptions.find((option) => option.relationType === relationType);
}

export function suggestCanonicalId(canonicalType: string, label: string): string | undefined {
  const definition = getAuthoringType(canonicalType);
  if (!definition) return undefined;
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  return slug ? `${definition.idPrefix}.${slug}` : undefined;
}

export function mutationProperties(mutation: EntityMutation): Record<string, unknown> {
  if (mutation.operation === "create") return mutation.properties;
  if (mutation.operation === "update") return mutation.changedProperties;
  return {};
}

function relation(relationType: string, ontologyIri: string, label: string, sourceCanonicalType: string, targetCanonicalType: string): AuthoringRelationOption {
  return {
    relationType,
    ontologyIri,
    label,
    sourceCanonicalType,
    targetCanonicalType,
    allowMultiple: true,
    requiredProperties: [],
    validationDescription: `${sourceCanonicalType} -> ${targetCanonicalType}, governed by ${ontologyIri}.`,
  };
}
