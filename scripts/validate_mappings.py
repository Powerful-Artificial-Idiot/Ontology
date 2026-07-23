from __future__ import annotations

import json
import sys

from jsonschema import Draft202012Validator, FormatChecker
from rdflib import OWL, RDF

from common import ROOT, expand_curie, load_ontology_graph


def main() -> int:
    schema = json.loads((ROOT / "mappings" / "mapping-schema.json").read_text())
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    ontology = load_ontology_graph()
    classes = set(ontology.subjects(RDF.type, OWL.Class))
    object_properties = set(ontology.subjects(RDF.type, OWL.ObjectProperty))
    properties = object_properties | set(ontology.subjects(RDF.type, OWL.DatatypeProperty))
    files = sorted(path for path in (ROOT / "mappings").rglob("*.json") if path.name != "mapping-schema.json")

    for path in files:
        payload = json.loads(path.read_text())
        errors = sorted(validator.iter_errors(payload), key=lambda item: list(item.path))
        if errors:
            raise AssertionError(f"Mapping schema errors in {path}: {errors[0].message}")
        for mapping in payload["mappings"]:
            term = expand_curie(mapping["ontologyTerm"])
            expected = classes if mapping["mappingType"] == "class" else properties
            if term not in expected:
                raise AssertionError(f"Mapping target is not a declared {mapping['mappingType']}: {mapping['ontologyTerm']} in {path}")
        for profile in payload.get("syncProfiles", []):
            if expand_curie(profile["canonicalType"]) not in classes:
                raise AssertionError(f"Sync profile target is not a declared class: {profile['canonicalType']} in {path}")
            allowlist = set(profile["allowedSourceFields"])
            referenced_fields = {
                profile["idSourceField"],
                profile["labelSourceField"],
                *(item["sourceField"] for item in profile["propertyMappings"]),
                *(item["sourceField"] for item in profile["relationMappings"]),
            }
            if not referenced_fields <= allowlist:
                raise AssertionError(f"Sync profile references fields outside its allowlist in {path}: {sorted(referenced_fields - allowlist)}")
            for relation in profile["relationMappings"]:
                if expand_curie(relation["predicate"]) not in object_properties:
                    raise AssertionError(f"Sync relation target is not a declared object property: {relation['predicate']} in {path}")

    print(f"Mapping validation passed: {len(files)} source-system mappings.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
