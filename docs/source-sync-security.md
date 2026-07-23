# Source Synchronization Security

HTTP extraction uses profile-fixed base URLs and allowlisted normalized paths. Production-shaped endpoints require HTTPS. Local HTTP is allowed only for explicitly configured localhost fixtures.

The adapter rejects file URLs, URL userinfo, path traversal, redirects, unapproved hosts/ports/paths and DNS results in private, loopback, link-local or unspecified ranges. It limits response bytes, pages, records, retries, request timeout and total duration, and supports cancellation.

Only 429, 500 and 503 receive bounded retries. Authentication failures do not retry. Errors, telemetry and audit omit query credentials, authorization headers, tokens and raw bodies. The management API removes secret references, full authorization snapshots and local paths.
