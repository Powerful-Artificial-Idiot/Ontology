# Source Authentication And Secrets

Four identities are distinct:

1. API user authentication protects management routes.
2. Connector service principal authorizes scheduled synchronization.
3. Source authentication obtains data from the configured source.
4. Publication authorization controls canonical and document writes.

`fixture-none` is allowed only for controlled files or explicitly enabled localhost fixtures. `static-bearer` resolves an `MKG_SOURCE_SECRET_*` reference server-side immediately before the request. A 401 or 403 is not retried.

Credentials, authorization headers, secret values, raw bodies and full error bodies are excluded from profiles, runs, checkpoints, quarantine, telemetry, audit and API responses. Enterprise source OAuth and rotation remain pending.
