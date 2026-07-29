# Knowledge Authoring Security

The API reuses Phase 5C authentication and authorization. Permissions are `knowledge-authoring:read`, `edit`, `submit`, `review`, `approve`, `publish`, and `admin`. Roles are mapped independently, with `demo-knowledge-admin` containing all actions for controlled acceptance.

Every resource is checked for tenant, domain, object scope, role, and ownership. Reviewers, approvers, and publishers may access same-tenant collaborative Change Sets without becoming their owner. Cross-tenant and domain-denied access fail closed.

Responses omit authorization snapshots. Stores and audits exclude bearer tokens, authorization headers, secrets, raw environment values, server paths, prompts, provider output, reasoning content, and chain of thought. Static bearer remains a controlled deployment adapter, not enterprise IAM.
