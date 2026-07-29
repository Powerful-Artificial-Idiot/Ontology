# Knowledge Authoring Validation

Validation is server-side and deterministic. It checks contract shape, enabled canonical type, ID prefix and normalization, duplicate IDs in the Change Set and other pending changes, required fields, reference existence, ontology relation allowlist and direction, expected versions, source field ownership, tenant/domain authorization, and a bounded mutation count.

Blocking issues prevent submit, approve, and publish. Stable codes include `CANONICAL_ID_INVALID`, `CANONICAL_ID_ALREADY_EXISTS`, `REQUIRED_FIELD_MISSING`, `UNKNOWN_CANONICAL_REFERENCE`, `RELATION_TYPE_INVALID`, `RELATION_DIRECTION_INVALID`, `VERSION_CONFLICT`, and `SOURCE_OWNED_FIELD_NOT_EDITABLE`.

The current deterministic SHACL gate covers the first-batch required properties and ontology direction rules. Online SHACL editing and automatic ontology expansion are out of scope.
