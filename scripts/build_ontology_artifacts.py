from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

from rdflib import Graph, OWL, RDF, RDFS, URIRef

from common import ROOT, load_ontology_graph


OUTPUT = ROOT / "packages" / "demo-data" / "ontology" / "generated"
FORBIDDEN_VIEW_FIELDS = {"position", "x", "y", "lane", "column", "color", "thumbnail", "visualType", "viewMetadata"}


def text(graph: Graph, subject: URIRef, predicate: URIRef) -> str | None:
    value = next(iter(graph.objects(subject, predicate)), None)
    return str(value) if value is not None else None


def values(graph: Graph, subject: URIRef, predicate: URIRef) -> list[str]:
    return sorted({str(value) for value in graph.objects(subject, predicate)})


def local_name(iri: str) -> str:
    return iri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def json_bytes(payload: object) -> bytes:
    return (json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n").encode()


def module_catalog() -> tuple[dict, list[dict], dict[str, str]]:
    catalog_path = ROOT / "ontology" / "catalog" / "ontology-catalog.json"
    catalog = json.loads(catalog_path.read_text())
    modules = []
    term_modules: dict[str, str] = {}
    for item in catalog["modules"]:
        path = (catalog_path.parent / item["file"]).resolve()
        graph = Graph().parse(path, format="turtle")
        for ontology_type in (OWL.Class, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty):
            for subject in graph.subjects(RDF.type, ontology_type):
                term_modules[str(subject)] = item["id"]
        imports = sorted({str(value) for ontology in graph.subjects(RDF.type, OWL.Ontology) for value in graph.objects(ontology, OWL.imports)})
        modules.append({
            "id": item["id"],
            "namespace": item["namespace"],
            "sourceFile": path.relative_to(ROOT).as_posix(),
            "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "imports": imports,
        })
    return catalog, modules, term_modules


def build_artifacts() -> dict[str, bytes]:
    graph = load_ontology_graph()
    catalog, modules, term_modules = module_catalog()
    version = catalog["ontologyVersion"]

    class_iris = sorted({subject for subject in graph.subjects(RDF.type, OWL.Class)}, key=str)
    property_types = {
        OWL.ObjectProperty: "object",
        OWL.DatatypeProperty: "datatype",
        OWL.AnnotationProperty: "annotation",
    }
    property_records = []
    for ontology_type, property_type in property_types.items():
        for subject in graph.subjects(RDF.type, ontology_type):
            iri = str(subject)
            property_records.append({
                "iri": iri,
                "name": local_name(iri),
                "label": text(graph, subject, RDFS.label) or local_name(iri),
                "description": text(graph, subject, RDFS.comment),
                "propertyType": property_type,
                "domain": values(graph, subject, RDFS.domain),
                "range": values(graph, subject, RDFS.range),
                "inverseOf": values(graph, subject, OWL.inverseOf),
                "parentProperties": values(graph, subject, RDFS.subPropertyOf),
                "deprecated": str(next(iter(graph.objects(subject, OWL.deprecated)), "false")).lower() == "true",
                "replacements": values(graph, subject, RDFS.seeAlso),
                "module": term_modules.get(iri, "unknown"),
            })
    property_records.sort(key=lambda item: item["iri"])

    classes = []
    for subject in class_iris:
        iri = str(subject)
        classes.append({
            "iri": iri,
            "name": local_name(iri),
            "label": text(graph, subject, RDFS.label) or local_name(iri),
            "description": text(graph, subject, RDFS.comment),
            "parentClasses": values(graph, subject, RDFS.subClassOf),
            "properties": sorted(record["iri"] for record in property_records if iri in record["domain"]),
            "module": term_modules.get(iri, "unknown"),
            "version": version,
        })

    relations = [
        {
            "id": record["iri"],
            "name": record["name"],
            "label": record["label"],
            "sourceClasses": record["domain"],
            "targetClasses": record["range"],
            "predicate": record["iri"],
            "inverseOf": record["inverseOf"],
            "module": record["module"],
        }
        for record in property_records
        if record["propertyType"] == "object"
    ]

    payloads: dict[str, object] = {
        "classes.json": classes,
        "properties.json": property_records,
        "relations.json": relations,
        "modules.json": modules,
        "version.json": {
            "ontologyVersion": version,
            "artifactFormatVersion": "1.0.0",
            "source": "ontology/catalog/ontology-catalog.json",
        },
    }
    files = {name: json_bytes(payload) for name, payload in payloads.items()}
    manifest = {
        "ontologyVersion": version,
        "artifactFormatVersion": "1.0.0",
        "generator": "scripts/build_ontology_artifacts.py",
        "counts": {
            "classes": len(classes),
            "properties": len(property_records),
            "relations": len(relations),
            "modules": len(modules),
        },
        "files": [
            {"path": name, "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)}
            for name, content in sorted(files.items())
        ],
    }
    files["manifest.json"] = json_bytes(manifest)
    assert_no_view_fields(files)
    return files


def assert_no_view_fields(files: dict[str, bytes]) -> None:
    for name, content in files.items():
        payload = json.loads(content)
        stack = [payload]
        while stack:
            value = stack.pop()
            if isinstance(value, dict):
                forbidden = FORBIDDEN_VIEW_FIELDS & set(value)
                if forbidden:
                    raise AssertionError(f"Ontology artifact {name} contains view fields: {sorted(forbidden)}")
                stack.extend(value.values())
            elif isinstance(value, list):
                stack.extend(value)


def write_artifacts(files: dict[str, bytes], output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name, content in files.items():
        (output / name).write_bytes(content)


def check_artifacts(files: dict[str, bytes]) -> None:
    expected_names = set(files)
    actual_names = {path.name for path in OUTPUT.glob("*.json")} if OUTPUT.exists() else set()
    if expected_names != actual_names:
        raise AssertionError("Generated ontology artifact file set is stale; run `make ontology-artifacts`")
    for name, content in files.items():
        if (OUTPUT / name).read_bytes() != content:
            raise AssertionError(f"Generated ontology artifact is stale: {name}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    files = build_artifacts()
    if args.check:
        check_artifacts(files)
        print("Ontology artifacts are deterministic and current.")
        return 0
    output = args.output or OUTPUT
    write_artifacts(files, output)
    manifest = json.loads(files["manifest.json"])
    print(f"Generated ontology artifacts at {output}: {manifest['counts']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
