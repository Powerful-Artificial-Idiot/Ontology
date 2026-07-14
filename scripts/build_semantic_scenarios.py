from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from rdflib import Graph

from common import ROOT, load_turtle_tree


OUTPUT = ROOT / "packages" / "demo-data" / "semantic" / "generated" / "cq-004-machine-quality-impact.json"
QUERY = ROOT / "queries" / "competency" / "cq-004-machine-quality-impact.rq"
SOURCE = "examples/valid/brake-booster.ttl"


def local_name(iri: str) -> str:
    return iri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def humanize(value: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", value).replace("_", " ")


def concept_id(characteristic_iri: str) -> str:
    value = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", local_name(characteristic_iri)).lower()
    return value


def build_response(rows: list[tuple[str, str, str]]) -> dict:
    manifest = json.loads((ROOT / "packages" / "demo-data" / "manifest.json").read_text())
    results = []
    for index, (machine, failure_mode, characteristic) in enumerate(sorted(set(rows)), start=1):
        concept = concept_id(characteristic)
        evidence = {
            "sourceType": "rdf-fixture",
            "sourceId": SOURCE,
            "documentName": "Brake Booster governed example graph",
            "locator": f"CQ-004 row {index}",
            "recordedAt": manifest["generatedAt"],
        }
        machine_label = humanize(local_name(machine))
        failure_label = humanize(local_name(failure_mode))
        characteristic_label = humanize(local_name(characteristic))
        results.append({
            "entity": {
                "id": f"{concept}-term",
                "iri": characteristic,
                "type": "qual:QualityCharacteristic",
                "label": characteristic_label,
                "description": f"Quality characteristic that may be affected by {machine_label} through {failure_label}.",
                "domain": "quality",
                "properties": {
                    "machineIri": machine,
                    "failureModeIri": failure_mode,
                    "derivation": "machine -> associatedFailureMode -> mayAffect -> quality characteristic",
                },
                "source": [evidence],
                "status": "active",
            },
            "score": 1.0,
            "matchedConcepts": [concept],
            "matchedRelations": [
                {
                    "id": f"cq004-{index}-asserted-machine-failure",
                    "sourceId": machine,
                    "targetId": failure_mode,
                    "predicate": "qual:associatedFailureMode",
                    "label": "associated failure mode",
                    "properties": {},
                    "provenance": [evidence],
                    "confidence": 1.0,
                    "evidenceType": "source triple",
                    "assertionType": "asserted",
                },
                {
                    "id": f"cq004-{index}-asserted-failure-characteristic",
                    "sourceId": failure_mode,
                    "targetId": characteristic,
                    "predicate": "qual:mayAffect",
                    "label": "may affect",
                    "properties": {},
                    "provenance": [evidence],
                    "confidence": 1.0,
                    "evidenceType": "source triple",
                    "assertionType": "asserted",
                },
                {
                    "id": f"cq004-{index}-inferred-machine-impact",
                    "sourceId": machine,
                    "targetId": characteristic,
                    "predicate": "derived:machineQualityImpact",
                    "label": "may impact quality characteristic",
                    "properties": {"viaFailureMode": failure_mode, "competencyQuestion": "CQ-004"},
                    "provenance": [evidence],
                    "confidence": 1.0,
                    "evidenceType": "SPARQL property path",
                    "assertionType": "inferred",
                },
            ],
            "explanation": f"CQ-004 found asserted links from {machine_label} to {failure_label} and from {failure_label} to {characteristic_label}; the direct machine-to-characteristic impact is inferred from that path.",
            "evidence": [evidence],
        })
    return {
        "metadata": {
            "contractVersion": manifest["contractVersion"],
            "ontologyVersion": manifest["ontologyVersion"],
            "dataVersion": manifest["demoDataVersion"],
            "traceId": "generated-cq-004-machine-quality-impact",
            "generatedAt": manifest["generatedAt"],
        },
        "results": results,
        "total": len(results),
    }


def execute_query(graph: Graph) -> list[tuple[str, str, str]]:
    return [(str(row.machine), str(row.failureMode), str(row.characteristic)) for row in graph.query(QUERY.read_text())]


def serialized(payload: dict) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    graph = load_turtle_tree(ROOT / "examples" / "valid")
    payload = build_response(execute_query(graph))
    if build_response([])["total"] != 0 or build_response([])["results"]:
        raise AssertionError("Empty CQ-004 results must generate an empty semantic response")
    content = serialized(payload)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != content:
            raise AssertionError("CQ-004 semantic scenario is stale; run `make semantic-scenarios`")
        assertions = {relation["assertionType"] for result in payload["results"] for relation in result["matchedRelations"]}
        if assertions != {"asserted", "inferred"} or any(not result["evidence"] or not result["explanation"] for result in payload["results"]):
            raise AssertionError("CQ-004 semantic scenario lost assertion, inference, evidence, or explanation metadata")
        print(f"CQ-004 semantic scenario is current: {payload['total']} result(s).")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(content)
    print(f"Generated {OUTPUT.relative_to(ROOT)} with {payload['total']} result(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
