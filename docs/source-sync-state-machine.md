# Source Synchronization State Machine

The legal main path is:

```text
created -> extracting -> mapping -> validating -> staging
        -> publishing -> verifying -> reconciling -> completed
```

Failure outcomes are `failed`, `cancelled` and `recovery-required`. Backward transitions and mutation of completed, failed or cancelled runs are rejected centrally.

Only a verified, reconciled and committed run advances its checkpoint. Dry-run, validate-only, reconcile-only, failed, cancelled and recovery-required runs do not advance it. Interrupted staging, publishing, verifying or reconciling runs become recovery-required; earlier interrupted runs fail. Recovery requires an explicit run ID and never guesses a target.
