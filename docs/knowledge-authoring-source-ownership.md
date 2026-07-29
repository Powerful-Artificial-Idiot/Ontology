# Knowledge Authoring Source Ownership

Fields are owned by `manual`, `mes`, `plm`, or `qms`. Manual fields such as label, description, owner, and governed annotations can be edited. Source-managed identity, status, metric, unit, cycle time, specification, severity, and program-version fields are read-only in the authoring form and are checked again by the server.

Source-managed and mixed objects retain their original source lineage. Manual updates append `manual-authoring` provenance with Change Set, actor, tenant, domain, before/after version, validation policy, approval policy, and publication timestamp. Manual authoring never claims MES, PLM, or QMS origin.

Source-system writeback is explicitly not part of Phase 5E.
