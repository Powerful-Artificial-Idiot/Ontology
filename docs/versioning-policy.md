# Versioning Policy

Four versions evolve independently:

| Asset | Current | Change rule |
| --- | --- | --- |
| Demo application | `0.1.0` | UI behavior and frontend code |
| Ontology | `1.1.0` | OWL terms, constraints, and semantic compatibility |
| Demo dataset | `0.5.0` | Fixture content and scenarios |
| Knowledge contract | `1.0.0` | API payload compatibility |

Use semantic versioning. Breaking term removal, incompatible range change, or required payload removal increments major. Backward-compatible terms and optional fields increment minor. Corrections increment patch.

Ontology releases must update `owl:versionInfo`, `owl:versionIRI`, catalog metadata, migration notes, and release manifest. Dataset and contract versions are stored in `packages/demo-data/manifest.json`.

Release manifests record both `gitCommit` and `gitDirty`. Official tagged releases must have `gitDirty: false`; local evaluation builds may be dirty but remain explicitly marked.

Deprecated terms remain resolvable for at least one minor release and must declare their replacement and migration path before removal.
