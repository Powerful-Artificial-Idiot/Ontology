# Knowledge Authoring Approval Policy

The default demo policy requires validation, submission, approval, and publication but allows one demo administrator to perform the three distinct transitions. This supports a deterministic management demo without adding a bypass.

Production-ready policy flags can require a distinct submitter and approver and a distinct approver and publisher. The service enforces these rules, not the UI. Approval records the current revision and deterministic content hash. A changed mutation, stale base version, missing reference, or changed governance rule invalidates approval before publication.

The current phase does not implement enterprise organization lookup, delegation, multi-party signing, or external OA workflow integration.
