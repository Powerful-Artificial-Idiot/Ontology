# Agent Security

Deterministic authorization policy for Agent API sessions, domains, governed objects, evidence, citations, and audit resources.

The package does not authenticate credentials. HTTP authentication remains an injectable API adapter so an enterprise OIDC provider can replace the local acceptance adapter without changing pipeline contracts.
