# Governed Source Synchronization

Phase 5D provider-neutral connector and synchronization boundary for controlled MES, QMS, and PLM extracts.

The package validates approved manifests, file and record checksums, explicit mapping versions, canonical ID allowlists, tenant/domain authorization, cursor order, idempotency, stale records, tombstones, and atomic snapshot commits. It never evaluates mapping expressions or writes raw source payloads into Agent traces or audit events.
