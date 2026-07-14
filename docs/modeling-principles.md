# Modeling Principles

## Ontology and View Model Are Separate

Ontology terms describe the business world. `x`, `y`, `width`, `height`, `color`, `opacity`, `isExpanded`, `isFocused`, `stackIndex`, and `laneIndex` belong to Graph View Models.

## Definition and Execution Are Separate

`OperationDefinition` describes the governed operation. `OperationExecution` records an occurrence with an event time. The same distinction applies to product definitions and instances, configurations and configuration versions, and control plans and control-plan versions.

## Schema and Instances Are Separate

OWL and SHACL define meaning and constraints. Files under `examples/` and `packages/demo-data/` contain instances and API fixtures. Runtime facts are not copied into ontology schema files.

## Authoritative and Candidate Knowledge Are Separate

Mappings preserve source provenance. Rules produce derived or candidate assertions. Production approval workflows must promote candidates explicitly rather than silently replacing source facts.

## Git Time and Business Time Are Separate

Git records when definitions changed. `eventTime`, `validFrom`, `validTo`, `effectiveDate`, `recordedAt`, and `modifiedAt` record business and system time. A commit timestamp must never be used as a substitute.

## Evidence Before Convenience

Semantic search and agent context must return the ontology term, source field, evidence, version, and explanation needed to understand a result. Similar labels alone are insufficient for identity resolution.

## Application Alignment Is Not Domain Promotion

The `explorer-alignment` module records current Ontology Explorer property IDs so they are machine-checkable. These application terms are compatibility assets, not automatically approved enterprise-domain properties. Promotion requires definition, ownership, domain/range, evidence, and migration review.
