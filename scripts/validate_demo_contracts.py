from __future__ import annotations

import json
import hashlib
import re
import sys

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from common import ROOT, expand_curie, load_ontology_graph, ontology_terms


def load_schema(name: str) -> dict:
    schema = json.loads((ROOT / "packages" / "knowledge-contracts" / "schemas" / name).read_text())
    Draft202012Validator.check_schema(schema)
    return schema


def schema_registry(schemas: list[dict]) -> Registry:
    return Registry().with_resources((schema["$id"], Resource.from_contents(schema)) for schema in schemas)


def validate_json(payload: object, schema: dict, registry: Registry, label: str) -> None:
    errors = sorted(Draft202012Validator(schema, registry=registry, format_checker=FormatChecker()).iter_errors(payload), key=lambda item: list(item.path))
    if errors:
        location = "/".join(str(value) for value in errors[0].path)
        raise AssertionError(f"{label} contract error at {location or '<root>'}: {errors[0].message}")


def main() -> int:
    schemas = [load_schema(name) for name in (
        "knowledge-entity.schema.json",
        "knowledge-relation.schema.json",
        "graph-view.schema.json",
        "ontology-graph.schema.json",
        "semantic-search.schema.json",
        "semantic-catalog.schema.json",
        "agent-turn-request.schema.json",
        "semantic-query-plan.schema.json",
        "graph-query-plan.schema.json",
        "graph-traversal.schema.json",
        "graph-traversal-result.schema.json",
        "evidence-pack.schema.json",
        "agent-turn-response.schema.json",
        "create-agent-session-request.schema.json",
        "agent-session.schema.json",
        "agent-turn-record.schema.json",
        "agent-turn-run.schema.json",
        "agent-run-event.schema.json",
        "canonical-knowledge-baseline.schema.json",
    )]
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
    generated_search = json.loads((ROOT / "packages" / "demo-data" / "semantic" / "generated" / "cq-004-machine-quality-impact.json").read_text())
    validate_json(generated_search, by_title["SemanticSearchResponse"], registry, "generated CQ-004 semantic scenario")
    assertion_types = {relation.get("assertionType") for result in generated_search["results"] for relation in result.get("matchedRelations", [])}
    if assertion_types != {"asserted", "inferred"} or any(not result.get("evidence") or not result.get("explanation") for result in generated_search["results"]):
        raise AssertionError("Generated CQ-004 scenario must preserve asserted, inferred, evidence, and explanation metadata")

    canonical_files = sorted((ROOT / "packages" / "demo-data" / "canonical").glob("*.json"))
    canonicals = {}
    for canonical_path in canonical_files:
        canonical = json.loads(canonical_path.read_text())
        validate_json(canonical, by_title["CanonicalKnowledgeBaseline"], registry, str(canonical_path))
        validate_canonical_baseline(canonical, terms)
        scenario_id = canonical["scenario"]["id"]
        if scenario_id in canonicals:
            raise AssertionError(f"Duplicate canonical scenario ID: {scenario_id}")
        canonicals[scenario_id] = canonical

    evaluation_schema_path = ROOT / "packages" / "agent-evaluation" / "schemas" / "evaluation-dataset.schema.json"
    evaluation_schema = json.loads(evaluation_schema_path.read_text())
    Draft202012Validator.check_schema(evaluation_schema)
    evaluation_files = sorted((ROOT / "packages" / "demo-data" / "evaluations").glob("*.v*.json"))
    evaluation_files = [path for path in evaluation_files if "release-policy" not in path.name]
    for path in evaluation_files:
        evaluation = json.loads(path.read_text())
        validate_json(evaluation, evaluation_schema, Registry(), str(path))
        validate_evaluation_dataset(evaluation, canonicals)

    document_schema_path = ROOT / "packages" / "document-evidence" / "schemas" / "document-registry.schema.json"
    document_schema = json.loads(document_schema_path.read_text())
    Draft202012Validator.check_schema(document_schema)
    scenario_by_document_directory = {
        "leak-rate": "quality-issue-trace",
        "engineering-change": "engineering-change-impact",
        "bottleneck": "bottleneck-analysis",
    }
    document_registry_files = sorted((ROOT / "packages" / "demo-data" / "documents").glob("*/document-registry.json"))
    for document_registry_path in document_registry_files:
        document_registry = json.loads(document_registry_path.read_text())
        validate_json(document_registry, document_schema, Registry(), str(document_registry_path))
        scenario_id = scenario_by_document_directory.get(document_registry_path.parent.name)
        if not scenario_id or scenario_id not in canonicals:
            raise AssertionError(f"No canonical scenario mapping for document registry: {document_registry_path}")
        validate_document_registry(document_registry, document_registry_path.parent, canonicals[scenario_id])

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

    print(f"Contract validation passed: {len(graph_files)} graph views, {len(evaluation_files)} Agent evaluation dataset(s), semantic fixtures, {len(canonical_files)} canonical Agent baselines, {len(document_registry_files)} governed document registries, legacy mappings, and ontology alignment.")
    return 0


def validate_canonical_baseline(baseline: dict, terms: set) -> None:
    entity_ids = {entity["id"] for entity in baseline["entities"]}
    if len(entity_ids) != len(baseline["entities"]):
        raise AssertionError("Canonical baseline contains duplicate entity IDs")
    unknown_alias_ids = set(baseline.get("semanticAliases", {})) - entity_ids
    if unknown_alias_ids:
        raise AssertionError(f"Canonical semantic aliases reference unknown entities: {sorted(unknown_alias_ids)}")
    relation_ids = {relation["id"] for relation in baseline["relations"]}
    if len(relation_ids) != len(baseline["relations"]):
        raise AssertionError("Canonical baseline contains duplicate relation IDs")
    for entity in baseline["entities"]:
        if expand_curie(entity["type"]) not in terms:
            raise AssertionError(f"Canonical entity uses unknown ontology type: {entity['id']} -> {entity['type']}")
    for relation in baseline["relations"]:
        if expand_curie(relation["predicate"]) not in terms:
            raise AssertionError(f"Canonical relation uses unknown ontology predicate: {relation['id']} -> {relation['predicate']}")
        if relation["sourceId"] not in entity_ids or relation["targetId"] not in entity_ids:
            raise AssertionError(f"Canonical relation endpoint is missing: {relation['id']}")

    seed_ids = set(baseline["scenario"]["seedEntityIds"])
    if not seed_ids <= entity_ids:
        raise AssertionError(f"Canonical scenario has unknown seed IDs: {sorted(seed_ids - entity_ids)}")
    plan_entity_ids = {entity["id"] for entity in baseline["queryPlan"]["entities"]}
    if not plan_entity_ids <= entity_ids:
        raise AssertionError(f"Canonical query plan has unknown entity IDs: {sorted(plan_entity_ids - entity_ids)}")
    if baseline["request"]["message"] != baseline["scenario"]["question"] or baseline["queryPlan"]["originalQuestion"] != baseline["scenario"]["question"]:
        raise AssertionError("Canonical request, query plan, and scenario question must match")
    if baseline["expectedResponse"]["queryPlan"] != baseline["queryPlan"]:
        raise AssertionError("Canonical expected response must preserve the validated query plan")
    if baseline["graphQueryPlan"]["semanticPlanId"] != baseline["queryPlan"]["planId"]:
        raise AssertionError("Canonical graph query plan must reference the semantic query plan")
    if baseline["expectedResponse"]["evidencePack"] != baseline["evidencePack"]:
        raise AssertionError("Canonical expected response must preserve the evidence pack")

    evidence_ids = {item["id"] for item in baseline["evidencePack"]["items"]}
    claim_ids = {claim["id"] for claim in baseline["expectedResponse"]["answer"]["claims"]}
    claim_policies = baseline["evidencePack"].get("claimPolicies", [])
    policy_ids = {policy["claimId"] for policy in claim_policies}
    if len(policy_ids) != len(claim_policies):
        raise AssertionError("Canonical Evidence Pack contains duplicate claim policies")
    if policy_ids != claim_ids:
        raise AssertionError("Canonical Evidence Pack claim policies must cover every expected answer claim")
    expected_classification = {claim["id"]: claim["classification"] for claim in baseline["expectedResponse"]["answer"]["claims"]}
    for policy in claim_policies:
        if policy["classification"] != expected_classification[policy["claimId"]]:
            raise AssertionError(f"Claim policy classification mismatch: {policy['claimId']}")
    for item in baseline["evidencePack"]["items"]:
        unknown_entities = set(item["linkedEntityIds"]) - entity_ids
        if unknown_entities:
            raise AssertionError(f"Evidence {item['id']} links unknown entities: {sorted(unknown_entities)}")
        unknown_claims = set(item["supportsClaimIds"]) - claim_ids
        if unknown_claims:
            raise AssertionError(f"Evidence {item['id']} supports unknown claims: {sorted(unknown_claims)}")
    for claim in baseline["expectedResponse"]["answer"]["claims"]:
        citation_ids = {citation["evidenceId"] for citation in claim["citations"]}
        if claim["classification"] == "fact" and not citation_ids:
            raise AssertionError(f"Factual claim has no citation: {claim['id']}")
        if not citation_ids <= evidence_ids:
            raise AssertionError(f"Claim {claim['id']} cites unknown evidence: {sorted(citation_ids - evidence_ids)}")
    checked_ids = set(baseline["expectedResponse"]["citationValidation"]["checkedClaimIds"])
    if checked_ids != claim_ids:
        raise AssertionError("Citation validation must cover every canonical claim")


def validate_document_registry(document_registry: dict, root, baseline: dict) -> None:
    document_ids = set()
    source_versions = set()
    evidence_by_document = {
        item.get("governance", {}).get("documentId"): item
        for item in baseline["evidencePack"]["items"]
        if item.get("governance")
    }
    for document in document_registry["documents"]:
        document_id = document["documentId"]
        if document_id in document_ids:
            raise AssertionError(f"Document registry contains duplicate document ID: {document_id}")
        document_ids.add(document_id)
        source_version = (document["sourceSystem"], document["sourceId"], document["version"])
        if source_version in source_versions:
            raise AssertionError(f"Document registry contains duplicate source/version: {source_version}")
        source_versions.add(source_version)
        content_path = (root / document["contentFile"]).resolve()
        if root.resolve() not in content_path.parents:
            raise AssertionError(f"Document content escapes registry root: {document_id}")
        actual_checksum = "sha256:" + hashlib.sha256(content_path.read_bytes()).hexdigest()
        if actual_checksum != document["contentChecksum"]:
            raise AssertionError(f"Document checksum mismatch: {document_id}")
        evidence = evidence_by_document.get(document_id)
        if not evidence:
            raise AssertionError(f"Canonical Evidence Pack has no governed chunk for document: {document_id}")
        if not evidence["id"].startswith("evidence-chunk.") or not evidence["source"].get("locator"):
            raise AssertionError(f"Document evidence must use a stable chunk ID and locator: {document_id}")
        governance = evidence["governance"]
        for field in ("contentChecksum", "parserId", "parserVersion", "approvalStatus", "lifecycleStatus", "owner"):
            expected = document[field]
            if governance[field] != expected:
                raise AssertionError(f"Document evidence governance mismatch for {document_id}: {field}")


def validate_evaluation_dataset(dataset: dict, baselines: dict[str, dict]) -> None:
    for case in dataset["cases"]:
        default_scenario_id = case.get("scenarioId", "quality-issue-trace")
        for turn in case["turns"]:
            scenario_id = turn.get("input", {}).get("scenarioId", default_scenario_id)
            baseline = baselines.get(scenario_id)
            if not baseline:
                raise AssertionError(f"Evaluation case {case['caseId']} references unknown scenario: {scenario_id}")
            entity_ids = {entity["id"] for entity in baseline["entities"]}
            relation_ids = {relation["id"] for relation in baseline["relations"]}
            evidence = {item["id"]: item for item in baseline["evidencePack"]["items"]}
            claim_ids = {claim["id"] for claim in baseline["expectedResponse"]["answer"]["claims"]}
            expected = turn["expected"]
            semantic = expected.get("semantic", {})
            unknown = set(semantic.get("entityIds", [])) - entity_ids
            if unknown:
                raise AssertionError(f"Evaluation case {case['caseId']} expects unknown semantic entities: {sorted(unknown)}")
            graph = expected.get("graph", {})
            unknown_objects = (set(graph.get("seedEntityIds", [])) | set(graph.get("requiredObjectIds", []))) - entity_ids
            unknown_relations = set(graph.get("requiredRelationIds", [])) - relation_ids
            if unknown_objects or unknown_relations:
                raise AssertionError(f"Evaluation case {case['caseId']} has unknown graph IDs: objects={sorted(unknown_objects)}, relations={sorted(unknown_relations)}")
            evidence_expectation = expected.get("evidence", {})
            unknown_evidence = set(evidence_expectation.get("requiredEvidenceIds", [])) - set(evidence)
            if unknown_evidence:
                raise AssertionError(f"Evaluation case {case['caseId']} expects unknown evidence: {sorted(unknown_evidence)}")
            for document in evidence_expectation.get("requiredDocuments", []):
                item = evidence.get(document["chunkId"])
                if not item or item.get("version") != document["version"] or item.get("governance", {}).get("documentId") != document["documentId"]:
                    raise AssertionError(f"Evaluation case {case['caseId']} has a document version/chunk mismatch: {document['documentId']}")
            answer = expected.get("answer", {})
            unknown_claims = set(answer.get("requiredClaimIds", [])) - claim_ids
            if unknown_claims:
                raise AssertionError(f"Evaluation case {case['caseId']} expects unknown claims: {sorted(unknown_claims)}")


if __name__ == "__main__":
    sys.exit(main())
