# Demo Data Governance

## Classification

> The dataset is synthetic and intended only for demonstrating governed knowledge retrieval and quantitative reasoning. It must not be used as a production manufacturing specification.

The rich baseline contains no real enterprise, customer, product, MES, PLM, QMS, credential, or production specification data. Controlled extracts are deterministic local fixtures with checksums, canonical ID mappings, source versions, timestamps, and lineage.

## Publication Rules

- Only the demo tenant `tenant.demo-manufacturing` may receive the optional seed.
- Seed is dry-run by default and never deletes graph data.
- Unknown IDs and unmapped fields are quarantined.
- Stale cursors, same-version hash conflicts, and unauthorized domains fail closed.
- Document evidence must be approved, effective, current, access-allowed, checksummed, and addressable by stable chunk locator.
- Draft/superseded documents and instruction-injection content do not enter the Evidence Pack.
- Derived calculations are marked `derived`; they never masquerade as source-system facts.

## Source Ownership

MES fixtures provide OP30/M220/program, cycle, WIP, period, and observation lineage. QMS fixtures provide specification/control/metric/MSA/calibration metadata. PLM fixtures provide the released product and current/proposed program-change state. These fixtures exercise Phase 5D mapping and publication boundaries without contacting an external system.

## Deployment Review

Before a controlled deployment:

1. run rich build, contract, ontology, SHACL, mapping, document, CQ, evaluation, security, and source-sync gates;
2. run seed dry-run and review counts/IDs;
3. confirm `.data` and credentials are not tracked;
4. apply only to the demo tenant;
5. rerun Mock/Neo4j parity and governed document verification;
6. rerun live DeepSeek acceptance in the deployment environment because provider-facing prompts/contracts changed.
