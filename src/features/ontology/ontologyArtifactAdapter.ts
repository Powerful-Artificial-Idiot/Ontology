import generatedClasses from "../../../packages/demo-data/ontology/generated/classes.json";
import generatedManifest from "../../../packages/demo-data/ontology/generated/manifest.json";
import generatedProperties from "../../../packages/demo-data/ontology/generated/properties.json";
import generatedRelations from "../../../packages/demo-data/ontology/generated/relations.json";
import type { OntologyLinkType, OntologyObjectType } from "../../types";
import { ontologyClassCurieByViewType, ontologyRelationCurieByViewLink } from "./ontologyViewConfig";

type GeneratedClass = (typeof generatedClasses)[number];
type GeneratedProperty = (typeof generatedProperties)[number];
type GeneratedRelation = (typeof generatedRelations)[number];

export type OntologyArtifactInput = {
  classes: readonly GeneratedClass[];
  properties: readonly GeneratedProperty[];
  relations: readonly GeneratedRelation[];
  ontologyVersion: string;
};

export const ontologyArtifact: OntologyArtifactInput = {
  classes: generatedClasses,
  properties: generatedProperties,
  relations: generatedRelations,
  ontologyVersion: generatedManifest.ontologyVersion,
};

export function connectOntologyViewToArtifact(
  nodes: readonly OntologyObjectType[],
  edges: readonly OntologyLinkType[],
  artifact: OntologyArtifactInput = ontologyArtifact,
  classMappings: Record<string, string> = ontologyClassCurieByViewType,
  relationMappings: Record<string, string> = ontologyRelationCurieByViewLink,
) {
  const classByIri = new Map(artifact.classes.map((item) => [item.iri, item]));
  const propertyByIri = new Map(artifact.properties.map((item) => [item.iri, item]));
  const relationByIri = new Map(artifact.relations.map((item) => [item.id, item]));

  const connectedNodes = nodes.map((node) => {
    const curie = requiredMapping(classMappings, node.id, "class");
    const semanticClass = classByIri.get(expandCurie(curie));
    if (!semanticClass) throw new Error(`Ontology artifact is missing class ${curie} required by view type ${node.id}.`);
    return {
      ...node,
      semanticIri: semanticClass.iri,
      semanticLabel: semanticClass.label,
      semanticModule: semanticClass.module,
      semanticVersion: semanticClass.version ?? artifact.ontologyVersion,
      properties: node.properties.map((property) => {
        const semanticProperty = propertyByIri.get(`https://example.com/mkg/explorer#${property.name}`);
        if (!semanticProperty) throw new Error(`Ontology artifact is missing Explorer property ux:${property.name} required by ${node.id}.`);
        return {
          ...property,
          semanticIri: semanticProperty.iri,
          semanticModule: semanticProperty.module,
          deprecated: semanticProperty.deprecated,
          replacementIris: semanticProperty.replacements,
        };
      }),
    } satisfies OntologyObjectType;
  });

  const connectedEdges = edges.map((edge) => {
    const curie = requiredMapping(relationMappings, edge.id, "relation");
    const semanticRelation = relationByIri.get(expandCurie(curie));
    if (!semanticRelation) throw new Error(`Ontology artifact is missing relation ${curie} required by view link ${edge.id}.`);
    return {
      ...edge,
      semanticIri: semanticRelation.id,
      semanticLabel: semanticRelation.label,
      semanticModule: semanticRelation.module,
    } satisfies OntologyLinkType;
  });

  return { nodes: connectedNodes, edges: connectedEdges, ontologyVersion: artifact.ontologyVersion };
}

function requiredMapping(mappings: Record<string, string>, id: string, kind: string) {
  const value = mappings[id];
  if (!value) throw new Error(`Ontology View Configuration has no ${kind} mapping for ${id}.`);
  return value;
}

function expandCurie(curie: string) {
  const [prefix, local] = curie.split(":", 2);
  const namespace = {
    core: "https://example.com/mkg/core#",
    mfg: "https://example.com/mkg/manufacturing#",
    qual: "https://example.com/mkg/quality#",
    equip: "https://example.com/mkg/equipment#",
    app: "https://example.com/mkg/application#",
  }[prefix];
  if (!namespace || !local) throw new Error(`Unsupported ontology CURIE in view configuration: ${curie}.`);
  return `${namespace}${local}`;
}
