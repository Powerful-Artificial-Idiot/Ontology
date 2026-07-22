from __future__ import annotations

from pathlib import Path

from rdflib import Graph, OWL, RDF, URIRef

ROOT = Path(__file__).resolve().parents[1]

NAMESPACES = {
    "core": "https://example.com/mkg/core#",
    "mfg": "https://example.com/mkg/manufacturing#",
    "qual": "https://example.com/mkg/quality#",
    "equip": "https://example.com/mkg/equipment#",
    "eng": "https://example.com/mkg/engineering#",
    "vs": "https://example.com/mkg/value-stream#",
    "app": "https://example.com/mkg/application#",
    "ux": "https://example.com/mkg/explorer#",
}


def load_turtle_tree(directory: Path) -> Graph:
    graph = Graph()
    for path in sorted(directory.rglob("*.ttl")):
        graph.parse(path, format="turtle")
    return graph


def load_ontology_graph() -> Graph:
    return load_turtle_tree(ROOT / "ontology")


def expand_curie(value: str) -> URIRef:
    prefix, separator, local = value.partition(":")
    if not separator or prefix not in NAMESPACES:
        raise ValueError(f"Unsupported ontology CURIE: {value}")
    return URIRef(f"{NAMESPACES[prefix]}{local}")


def ontology_terms(graph: Graph) -> set[URIRef]:
    terms: set[URIRef] = set()
    for ontology_type in (OWL.Class, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty):
        terms.update(graph.subjects(RDF.type, ontology_type))
    return terms
