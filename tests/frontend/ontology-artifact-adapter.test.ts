import { describe, expect, it } from "vitest";
import { ontologyLinkTypes, ontologyObjectTypes } from "../../src/repositories/legacyDemoData";
import {
  connectOntologyViewToArtifact,
  ontologyArtifact,
} from "../../src/features/ontology/ontologyArtifactAdapter";
import {
  ontologyClassCurieByViewType,
  ontologyRelationCurieByViewLink,
} from "../../src/features/ontology/ontologyViewConfig";

describe("Ontology artifact view adapter", () => {
  it("connects every visible type, property, and relation to a generated semantic term", () => {
    const connected = connectOntologyViewToArtifact(ontologyObjectTypes, ontologyLinkTypes);

    expect(connected.nodes).toHaveLength(26);
    expect(connected.edges).toHaveLength(31);
    expect(Object.keys(ontologyClassCurieByViewType)).toHaveLength(26);
    expect(Object.keys(ontologyRelationCurieByViewLink)).toHaveLength(31);
    expect(connected.nodes.every((node) => node.semanticIri && node.semanticModule && node.properties.every((property) => property.semanticIri))).toBe(true);
    expect(connected.edges.every((edge) => edge.semanticIri && edge.semanticModule)).toBe(true);
  });

  it("fails clearly when a mapped semantic class is missing", () => {
    const incomplete = {
      ...ontologyArtifact,
      classes: ontologyArtifact.classes.filter((item) => item.iri !== "https://example.com/mkg/manufacturing#Product"),
    };

    expect(() => connectOntologyViewToArtifact(ontologyObjectTypes, ontologyLinkTypes, incomplete)).toThrow("missing class mfg:Product");
  });

  it("keeps deprecated compatibility properties resolvable with replacements", () => {
    const connected = connectOntologyViewToArtifact(ontologyObjectTypes, ontologyLinkTypes);
    const cycleTime = connected.nodes.find((node) => node.id === "Operation")?.properties.find((property) => property.name === "cycleTime");

    expect(cycleTime?.deprecated).toBe(true);
    expect(cycleTime?.replacementIris).toContain("https://example.com/mkg/manufacturing#cycleTimeSeconds");
  });
});
