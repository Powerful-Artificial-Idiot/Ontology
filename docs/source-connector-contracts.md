# Source Connector Contracts

`ConnectorProfile` is the governed configuration boundary. It fixes source system, tenant, domains, adapter, endpoint allowlist, authentication type, synchronization limits, mapping profile, publication policy and enabled state. It stores only `secretReference`, never a credential value.

`ConnectorPrincipal` is a service identity separate from the API user. Both must pass tenant, domain, source-system and role checks before publication.

`ConnectorSyncRun` records a sanitized authorization snapshot, legal state, aggregate counters and checkpoints. `LineageRecord`, `QuarantineItem`, `ReconciliationResult`, `CanonicalMutation`, `GovernedDocumentChange` and `PublicationJournalEntry` are shared contracts in `packages/knowledge-contracts/src/sourceSync.ts`.

Profiles reject unknown fields, embedded credentials, duplicate IDs, unsafe URLs, implicit localhost HTTP and unsupported sources. Unknown source IDs are quarantined; connectors cannot create ontology terms, canonical IDs or relationships.
