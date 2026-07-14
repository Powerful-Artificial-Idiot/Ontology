# Temporal Modeling

## Time Dimensions

- `eventTime`: when an execution or event happened.
- `validFrom` and `validTo`: when a definition or fact is valid in the business world.
- `effectiveDate`: governance date for a released document or mapping.
- `recordedAt`: when a source system recorded the assertion.
- Git commit time: when repository content changed; never a business timestamp.

Intervals use inclusive dates in the current examples. Open-ended validity omits `validTo`. A production runtime should adopt explicit interval semantics and bi-temporal storage before historical correction workflows are enabled.

The fixture `CP001V2` is valid from 2025-01-01 through 2026-03-14. `CP001V3` becomes valid on 2026-03-15 and supersedes V2. Machine configuration examples use the same pattern.
