# Publication Journal And Recovery

Graph and document stores do not share a distributed transaction. The durable journal records:

```text
validated -> staged -> graph-published -> documents-published
-> verified -> committed
```

Any partial publication or verification failure becomes `recovery-required`. The checkpoint is not advanced and the run is not marked completed. Restart recovery detects unfinished run state; explicit recovery verifies both targets, regenerates idempotent lineage, reconciles and only then commits the checkpoint.

If the in-process staged context cannot be reconstructed safely, the operator receives `MANUAL_RECOVERY_REQUIRED`. The implementation never silently ignores cross-store inconsistency. A future distributed transaction coordinator remains pending.
