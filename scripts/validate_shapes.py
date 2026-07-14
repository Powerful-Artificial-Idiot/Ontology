from __future__ import annotations

import sys

from pyshacl import validate

from common import ROOT, load_ontology_graph, load_turtle_tree


def conforms(path, ontology_graph, shapes_graph) -> tuple[bool, str]:
    data_graph = load_turtle_tree(path) if path.is_dir() else None
    if data_graph is None:
        raise AssertionError(f"Expected fixture directory: {path}")
    result, _, report = validate(
        data_graph=data_graph,
        shacl_graph=shapes_graph,
        ont_graph=ontology_graph,
        inference="rdfs",
        advanced=True,
    )
    return bool(result), str(report)


def main() -> int:
    ontology_graph = load_ontology_graph()
    shapes_graph = load_turtle_tree(ROOT / "shapes")
    valid, valid_report = conforms(ROOT / "examples" / "valid", ontology_graph, shapes_graph)
    if not valid:
        raise AssertionError(f"Valid examples failed SHACL:\n{valid_report}")

    invalid, _ = conforms(ROOT / "examples" / "invalid", ontology_graph, shapes_graph)
    if invalid:
        raise AssertionError("Invalid examples unexpectedly passed SHACL.")

    print(f"SHACL validation passed: {len(shapes_graph)} shape triples; valid fixtures conform and invalid fixtures fail.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
