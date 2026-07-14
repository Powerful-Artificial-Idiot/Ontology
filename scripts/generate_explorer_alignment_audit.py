from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

from common import ROOT


OUTPUT = ROOT / "docs" / "explorer-alignment-audit.md"
MAPPING_SECTIONS = (
    "demo_type_mappings",
    "demo_relation_mappings",
    "ontology_explorer_type_mappings",
    "ontology_explorer_relation_mappings",
)
PREFIX_LAYERS = {
    "core": "Enterprise Core Ontology",
    "mfg": "Manufacturing Domain Ontology",
    "qual": "Quality Domain Ontology",
    "equip": "Equipment Domain Ontology",
    "app": "Application Ontology",
}


def escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def extract_properties(source: str) -> list[tuple[str, str, str]]:
    pattern = re.compile(r'property\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"', re.MULTILINE)
    usages: dict[str, dict[str, set[str]]] = {}
    for identifier, data_type, description in pattern.findall(source):
        entry = usages.setdefault(identifier, {"types": set(), "descriptions": set()})
        entry["types"].add(data_type)
        entry["descriptions"].add(description)
    return [
        (identifier, ", ".join(sorted(values["types"])), "; ".join(sorted(values["descriptions"])))
        for identifier, values in sorted(usages.items(), key=lambda item: item[0].lower())
    ]


def row(values: list[str]) -> str:
    return "| " + " | ".join(escape(value) for value in values) + " |"


def build_document() -> str:
    governance = yaml.safe_load((ROOT / "mappings" / "explorer-alignment-governance.yaml").read_text())
    mappings = yaml.safe_load((ROOT / "mappings" / "demo-type-mappings.yaml").read_text())
    ontology_source = (ROOT / "src" / "data" / "ontologyData.ts").read_text()
    properties = extract_properties(ontology_source)
    replacements = governance["deprecated_replacements"]
    default = governance["vocabulary_default"]

    lines = [
        "# Explorer Alignment Semantic Audit",
        "",
        "This audit separates governed enterprise semantics from application compatibility terms and canvas-only fields. It is generated from the current Explorer source, mapping catalog, and contract governance policy; edit the sources and rerun `make alignment-audit` instead of editing the tables directly.",
        "",
        "## Decision Rules",
        "",
        "- `ux:*` properties remain compatibility terms until domain review approves a governed replacement.",
        "- Existing runtime fields are not removed. Replaced terms keep adapter support and regression coverage.",
        "- `view-model` fields describe rendering or layout and must not be promoted into the domain ontology.",
        "- `legacy-mapping` rows are explicit translation boundaries, not new ontology terms.",
        "- `unknown` is permitted by the policy but is not accepted for the current audited inventory.",
        "",
        "## Inventory Summary",
        "",
        f"- Explorer compatibility properties: **{len(properties)}**",
        f"- Legacy type and relation mappings: **{sum(len(mappings[section]) for section in MAPPING_SECTIONS)}**",
        f"- Contract and view-model fields: **{len(governance['contract_fields'])}**",
        f"- Approved replacement paths: **{len(replacements)}**",
        "",
        "## Compatibility Property Audit",
        "",
        row(["Identifier", "Current definition", "Current usage", "Pages", "Classification", "Target layer", "Action", "Replacement", "Owner", "Risk"]),
        row(["---"] * 10),
    ]

    for identifier, data_type, description in properties:
        replacement = replacements.get(identifier)
        if replacement:
            classification = "deprecated"
            target_layer = replacement["target_layer"]
            action = "replace"
            replacement_id = replacement["replacement"]
            risk = "high"
        else:
            classification = default["classification"]
            target_layer = default["target_layer"]
            action = default["action"]
            replacement_id = "-"
            risk = default["compatibility_risk"]
        lines.append(row([
            f"ux:{identifier}",
            f"{description} ({data_type})",
            "Ontology Explorer property metadata",
            "Ontology Explorer",
            classification,
            target_layer,
            action,
            replacement_id,
            default["owner"],
            risk,
        ]))

    lines.extend([
        "",
        "## Legacy Mapping Audit",
        "",
        row(["Identifier", "Current definition", "Current usage", "Pages", "Classification", "Target layer", "Action", "Replacement", "Owner", "Risk"]),
        row(["---"] * 10),
    ])
    for section in MAPPING_SECTIONS:
        pages = "Route Explorer" if section.startswith("demo_") else "Ontology Explorer"
        kind = "type" if "type" in section else "relation"
        for frontend_term, ontology_term in sorted(mappings[section].items(), key=lambda item: item[0].lower()):
            prefix = ontology_term.split(":", 1)[0]
            lines.append(row([
                f"{section}:{frontend_term}",
                f"Maps the frontend {kind} to {ontology_term}.",
                "Legacy adapter translation",
                pages,
                "legacy-mapping",
                PREFIX_LAYERS.get(prefix, "Application Ontology"),
                "retain",
                ontology_term,
                "Knowledge Integration Owner",
                "low",
            ]))

    lines.extend([
        "",
        "## Contract And View-Model Audit",
        "",
        row(["Identifier", "Current definition", "Current usage", "Pages", "Classification", "Target layer", "Action", "Replacement", "Owner", "Risk"]),
        row(["---"] * 10),
    ])
    for identifier, classification in governance["contract_fields"].items():
        target = "Graph View Configuration" if classification == "view-model" else "Knowledge Contract"
        lines.append(row([
            identifier,
            "Graph transport or canvas rendering field.",
            "Repository response and Explorer rendering",
            "All Explorers",
            classification,
            target,
            "retain",
            "-",
            "Frontend Platform Owner",
            "low",
        ]))

    lines.extend([
        "",
        "## Migration Register",
        "",
        row(["Legacy term", "Governed replacement", "Compatibility approach", "Removal condition"]),
        row(["---"] * 4),
    ])
    for identifier, replacement in sorted(replacements.items()):
        lines.append(row([
            f"ux:{identifier}",
            replacement["replacement"],
            "Keep the legacy field in the adapter; emit the governed term in generated artifacts.",
            "A major contract release after all Explorer pages and fixtures use the governed term.",
        ]))

    lines.extend([
        "",
        "## Domain Review Backlog",
        "",
        "The remaining `application-ontology` properties require domain-owner decisions on datatype, domain, range, units, temporal meaning, and whether an existing governed property can be reused. They must not be promoted by name similarity alone.",
        "",
        "## Validation",
        "",
        "`make contracts-validate` regenerates this audit in memory and fails when the committed document is stale, a source property is unclassified, an action is invalid, or an `unknown` classification remains.",
        "",
    ])
    return "\n".join(lines)


def validate_policy(document: str) -> None:
    governance = yaml.safe_load((ROOT / "mappings" / "explorer-alignment-governance.yaml").read_text())
    allowed_classifications = set(governance["allowed_classifications"])
    allowed_actions = set(governance["allowed_actions"])
    configured = {governance["vocabulary_default"]["classification"], "deprecated", "legacy-mapping", *governance["contract_fields"].values()}
    actions = {governance["vocabulary_default"]["action"], "replace", "retain"}
    if not configured <= allowed_classifications:
        raise AssertionError(f"Invalid alignment classifications: {sorted(configured - allowed_classifications)}")
    if not actions <= allowed_actions:
        raise AssertionError(f"Invalid alignment actions: {sorted(actions - allowed_actions)}")
    if "| unknown |" in document:
        raise AssertionError("Explorer alignment audit contains an unknown classification")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = build_document()
    validate_policy(document)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != document:
            raise AssertionError("Explorer alignment audit is stale; run `make alignment-audit`")
        print("Explorer alignment audit is complete and current.")
        return 0
    OUTPUT.write_text(document)
    print(f"Generated {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
