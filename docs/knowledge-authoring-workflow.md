# Knowledge Authoring Workflow

| State | Allowed actions | Required permission | Gate |
|---|---|---|---|
| draft | edit, validate, submit, withdraw, delete | edit / submit | full validation before submit |
| submitted | request changes, reject, approve, withdraw submission | review / approve / submit | revalidation before approve |
| changes-requested | edit, validate, resubmit, withdraw | edit / submit | comment required; approval cleared |
| approved | publish, withdraw approval | publish / approve | approval hash and full revalidation |
| rejected | read and audit | read | terminal; create a new draft |
| published | read and audit, create a new revision draft | read / edit | immutable terminal revision |
| withdrawn | read and audit | read | terminal |

Every write requires an idempotency key. A repeated key returns the first result without duplicating audit events or publication. Editing an approved change returns it to draft and records `AUTHORING_APPROVAL_INVALIDATED`.

Published knowledge cannot be permanently deleted. A new governed change can deactivate or supersede it. Only an unsubmitted draft Change Set can be deleted.
