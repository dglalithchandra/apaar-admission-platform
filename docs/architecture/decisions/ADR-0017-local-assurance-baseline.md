# ADR-0017: local assurance baseline

## Status

Accepted on 26 October 2026.

## Decision

Treat Stage 6 as a reproducible local baseline, not as a claim of national production readiness. The checked baseline comprises deterministic unit and PostgreSQL integration tests, OpenAPI and JSON Schema validation, automated accessibility scans, a mixed-route k6 smoke workload, container hardening checks, backup/restore recovery, dependency audit, software-bill-of-material generation, licence inventory, repository secret scanning and browser acceptance.

Metrics use only HTTP method, normalized route template and status. Academic identities, student references, institution identifiers and bearer tokens are prohibited from metric labels and security-event detail. Health is public and minimal; dependency status and metrics require the auditor role.

## Consequences

- Evidence and declared synthetic workloads are recorded in `docs/assurance/`.
- The local thresholds are regression guards, not capacity promises.
- Penetration testing, a privacy impact assessment, assistive-technology testing, national load targets and disaster-recovery objectives still require accountable owners and representative environments.
