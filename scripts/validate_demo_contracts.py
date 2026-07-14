from __future__ import annotations

import json
import re
import sys

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from common import ROOT, expand_curie, load_ontology_graph, ontology_terms


def load_schema(name: str) -> dict:
    return json.loads((ROOT / "packages" / "knowledge-contracts" / "schemas" / name).read_text())


def schema_registry(schemas: list[dict]) -> Registry:
    return Registry().with_resources((schema["$id"], Resource.from_contents(schema)) for schema in schemas)


def validate_json(payload: object, schema: dict, registry: Registry, label: str) -> None:
    errors = sorted(Draft202012Validator(schema, registry=registry, format_checker=FormatChecker()).iter_errors(payload), key=lambda item: list(item.path))
    if errors:
        location = "/".join(str(value) for value in errors[0].path)
        raise AssertionError(f"{label} contract error at {location or '<root>'}: {errors[0].message}")


def main() -> int:
    schemas = [load_schema(name) for name in ("knowledge-entity.schema.json", "knowledge-relation.schema.json", "graph-view.schema.json", "ontology-graph.schema.json", "semantic-search.schema.json")]
    registry = schema_registry(schemas)
    by_title = {schema["title"]: schema for schema in schemas}
    manifest = json.loads((ROOT / "packages" / "demo-data" / "manifest.json").read_text())
    ontology = load_ontology_graph()
    terms = ontology_terms(ontology)

    graph_files = sorted((ROOT / "packages" / "demo-data" / "graph").glob("*.json"))
    for path in graph_files:
        payload = json.loads(path.read_text())
        validate_json(payload, by_title["GraphViewResponse"], registry, str(path))
        if payload["metadata"]["ontologyVersion"] != manifest["ontologyVersion"] or payload["metadata"]["dataVersion"] != manifest["demoDataVersion"]:
            raise AssertionError(f"Version metadata mismatch in {path}")
        entity_ids = {entity["id"] for entity in payload["entities"]}
        relation_ids = {relation["id"] for relation in payload["relations"]}
        node_ids = {node["id"] for node in payload["nodes"]}
        for entity in payload["entities"]:
            if expand_curie(entity["type"]) not in terms:
                raise AssertionError(f"Unknown entity type {entity['type']} in {path}")
        for relation in payload["relations"]:
            if expand_curie(relation["predicate"]) not in terms:
                raise AssertionError(f"Unknown relation predicate {relation['predicate']} in {path}")
            if relation["sourceId"] not in entity_ids or relation["targetId"] not in entity_ids:
                raise AssertionError(f"Relation endpoints are missing in {path}: {relation['id']}")
        for node in payload["nodes"]:
            if node["entityId"] not in entity_ids:
                raise AssertionError(f"Graph node references missing entity in {path}: {node['id']}")
        for edge in payload["edges"]:
            if edge["source"] not in node_ids or edge["target"] not in node_ids or (edge.get("relationId") and edge["relationId"] not in relation_ids):
                raise AssertionError(f"Graph edge references missing element in {path}: {edge['id']}")

    search_payload = json.loads((ROOT / "packages" / "demo-data" / "semantic" / "sample-results.json").read_text())
    validate_json(search_payload, by_title["SemanticSearchResponse"], registry, "semantic sample results")

    alignment = yaml.safe_load((ROOT / "mappings" / "demo-type-mappings.yaml").read_text())
    source = (ROOT / "src" / "data" / "mockGraph.ts").read_text()
    runtime_types = set(re.findall(r'\btype:\s*"([^"]+)"', source))
    runtime_relations = set(re.findall(r'\brelationType:\s*"([^"]+)"', source))
    missing_types = runtime_types - set(alignment["demo_type_mappings"])
    missing_relations = runtime_relations - set(alignment["demo_relation_mappings"])
    if missing_types or missing_relations:
        raise AssertionError(f"Legacy Demo alignment missing types={sorted(missing_types)}, relations={sorted(missing_relations)}")
    for section in ("demo_type_mappings", "demo_relation_mappings", "ontology_explorer_type_mappings", "ontology_explorer_relation_mappings"):
        for frontend_term, ontology_term in alignment[section].items():
            if expand_curie(ontology_term) not in terms:
                raise AssertionError(f"Alignment target does not exist: {frontend_term} -> {ontology_term}")

    ontology_source = (ROOT / "src" / "data" / "ontologyData.ts").read_text()
    explorer_types = set(re.findall(r'objectType\(\s*"([^"]+)"', ontology_source))
    missing_explorer_types = explorer_types - set(alignment["ontology_explorer_type_mappings"])
    if missing_explorer_types:
        raise AssertionError(f"Ontology Explorer types have no formal mapping: {sorted(missing_explorer_types)}")
    explorer_relations = set(re.findall(r'linkType\(\s*"([^"]+)"', ontology_source))
    missing_explorer_relations = explorer_relations - set(alignment["ontology_explorer_relation_mappings"])
    if missing_explorer_relations:
        raise AssertionError(f"Ontology Explorer relations have no formal mapping: {sorted(missing_explorer_relations)}")
    explorer_properties = set(re.findall(r'property\(\s*"([^"]+)"', ontology_source))
    missing_explorer_properties = {property_id for property_id in explorer_properties if expand_curie(f"ux:{property_id}") not in terms}
    if missing_explorer_properties:
        raise AssertionError(f"Ontology Explorer properties have no application vocabulary term: {sorted(missing_explorer_properties)}")

    search_index = json.loads((ROOT / "packages" / "demo-data" / "semantic" / "search-index.json").read_text())
    semantic_source = (ROOT / "src" / "features" / "semantic" / "semanticData.ts").read_text()
    for concept in search_index["concepts"]:
        if f'id: "{concept["id"]}"' not in semantic_source:
            raise AssertionError(f"Semantic concept is not present in the Demo: {concept['id']}")

    print(f"Contract validation passed: {len(graph_files)} graph views, semantic search fixture, legacy mappings, and ontology alignment.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
