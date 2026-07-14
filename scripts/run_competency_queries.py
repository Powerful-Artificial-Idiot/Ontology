from __future__ import annotations

import sys

import yaml

from common import ROOT, load_turtle_tree


def main() -> int:
    graph = load_turtle_tree(ROOT / "examples" / "valid")
    catalog = yaml.safe_load((ROOT / "queries" / "competency" / "catalog.yaml").read_text())
    scenarios = {path.stem for path in (ROOT / "packages" / "demo-data" / "scenarios").glob("*.json")}
    executed = 0
    for question in catalog["questions"]:
        query_path = ROOT / "queries" / "competency" / question["query_file"]
        if not query_path.exists():
            raise AssertionError(f"Missing query for {question['id']}: {query_path}")
        if question["demo_scenario"] not in scenarios:
            raise AssertionError(f"Missing scenario for {question['id']}: {question['demo_scenario']}")
        rows = list(graph.query(query_path.read_text()))
        if not rows:
            raise AssertionError(f"Competency question returned no results: {question['id']}")
        executed += 1
        print(f"{question['id']}: {len(rows)} result(s)")
    if executed < 5:
        raise AssertionError("At least five competency questions are required.")
    print(f"Competency query validation passed: {executed} queries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
