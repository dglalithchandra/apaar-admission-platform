# Open-source intake policy

## Before adoption

1. Confirm an explicit licence and retain its notice.
2. Record the official repository, exact version/commit, use mode and owner.
3. Prefer maintained packages or signed container images over copied source.
4. Check release cadence, unresolved critical vulnerabilities and project governance.
5. Generate an SBOM for every releasable artefact and scan it in CI.
6. Pin versions and update through reviewed automated pull requests.
7. Reject source with no licence, unknown provenance or copied credentials.

## Use modes

- `dependency`: linked through a package/build manager.
- `container`: deployed as a separately versioned service.
- `reference-only`: inspected for ideas and tests; no code copied into the product.
- `owned-source`: intentionally copied under a licence that permits modification; provenance and notices are retained.

## Operational requirements

Maintain direct and transitive component inventory, cryptographic hashes for release artefacts, vulnerability exceptions with expiry, licence attribution, build provenance and a reproducible rollback path. Search indexes and AI models require separate data and model provenance.
