from __future__ import annotations

import sys

from rdflib import OWL, RDF

from common import ROOT, load_ontology_graph


def main() -> int:
    paths = sorted((ROOT / "ontology").rglob("*.ttl"))
    if not paths:
        raise AssertionError("No ontology Turtle files found.")

    graph = load_ontology_graph()
    ontologies = set(graph.subjects(RDF.type, OWL.Ontology))
    if len(ontologies) != len(paths):
        raise AssertionError(f"Expected one owl:Ontology declaration per file: {len(paths)} files, {len(ontologies)} declarations.")

    for ontology in ontologies:
        if not list(graph.objects(ontology, OWL.versionInfo)):
            raise AssertionError(f"Ontology has no owl:versionInfo: {ontology}")
        if not list(graph.objects(ontology, OWL.versionIRI)):
            raise AssertionError(f"Ontology has no owl:versionIRI: {ontology}")

    class_count = len(set(graph.subjects(RDF.type, OWL.Class)))
    property_count = sum(len(set(graph.subjects(RDF.type, kind))) for kind in (OWL.ObjectProperty, OWL.DatatypeProperty))
    if class_count < 30 or property_count < 20:
        raise AssertionError(f"Ontology unexpectedly small: {class_count} classes, {property_count} properties.")

    print(f"Ontology validation passed: {len(paths)} modules, {class_count} classes, {property_count} properties, {len(graph)} triples.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
