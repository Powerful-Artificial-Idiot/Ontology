# Namespace Policy

| Prefix | Namespace | Owner |
| --- | --- | --- |
| `core` | `https://example.com/mkg/core#` | Enterprise ontology |
| `mfg` | `https://example.com/mkg/manufacturing#` | Manufacturing domain |
| `qual` | `https://example.com/mkg/quality#` | Quality domain |
| `equip` | `https://example.com/mkg/equipment#` | Equipment domain |
| `app` | `https://example.com/mkg/application#` | Application concepts |
| `demo` | `https://example.com/mkg/demo#` | Non-production examples |

Class local names use singular PascalCase. Properties use lower camelCase. Published IRIs are stable and never encode UI lanes, colors, database table names, plant-specific labels, or mutable versions.

Version IRIs identify releases; term IRIs remain stable. Production deployment must replace the example domain with an approved enterprise namespace through a governed migration, not ad hoc string replacement.
