# Source Reconciliation

Reconciliation compares controlled source state, published canonical state, governance and lineage. Classifications are matched, source-only, canonical-only, version mismatch, hash mismatch, governance mismatch, authorization mismatch and lineage missing.

Reconcile-only never publishes or advances a checkpoint. Source-only does not auto-publish, canonical-only does not auto-delete or tombstone, and mismatches do not mutate source or canonical data. Reports contain identifiers, versions and hashes only.

Source-only, version/hash/governance/authorization mismatch and missing lineage are blocking. Canonical-only is reported for owner review and is non-destructive.
