# Governed Document Evidence

Deterministic document ingestion and retrieval for controlled manufacturing evidence.

The package provides:

- registry and governance validation;
- SHA-256 content verification;
- allowlisted structured parsing and normalization;
- stable locator-based chunk IDs and chunk checksums;
- instruction-like content quarantine;
- deterministic full-text and graph-linked retrieval;
- role/domain access filtering;
- conversion to shared `EvidenceItem` contracts.

Document text is treated as untrusted data. It cannot define entity links, claim support, versions, approval status, or access policy; those values come only from the governed registry.
