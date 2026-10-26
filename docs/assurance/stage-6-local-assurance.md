# Stage 6 local assurance report

Date: 26 October 2026. All inputs and identities were synthetic.

## Implemented controls

- Every recorded OpenAPI operation has one native or delegated transport mapping. Delegated responses fail closed when their content kind or documented success status is wrong.
- Local Ed25519 OIDC/JWKS exercises every role, issuer/audience/time validation, key rotation and invalid signatures. Synthetic authentication is forbidden in production mode.
- The APAAR adapter has bounded timeout, exponential retry with jitter, circuit open/half-open recovery, correlation propagation and an injected official-contract translator boundary.
- Approval imports require digest and manifest integrity, exact replay behavior, named supersession and serialized scope updates.
- Notification workers use transactional leasing, exponential retry, deduplication and dead-letter states.
- Purpose-limited receipts validate a deterministic signature and expose active, expired and append-only revoked states.
- Gateway requests have body/upload limits, timeouts, rate limits, strict origin handling, security headers, safe errors, correlation references, security events and identifier-safe metrics.
- Digest-pinned containers run the gateway non-root with a read-only filesystem, no new privileges and all Linux capabilities dropped.
- Repository checks include npm audit, CycloneDX SBOM generation, recursive package licence inventory and tracked/untracked text secret scanning.

## Performance evidence

The declared local workload used k6 1.3.0 with four virtual users and ten iterations each. Each iteration exercised health, admission transport, case listing, identity degradation, receipt creation, signed approval import and notification processing. The final run completed 280/280 checks, 280 HTTP requests and 40 iterations with 0% request failure. Observed latency was 1.42 ms average, 2.11 ms p95 and 9.73 ms p99.

These figures measure a loopback synthetic adapter, not PostgreSQL-backed national throughput. The thresholds (`p95 < 500 ms`, `p99 < 1 s`, failures below 1%) are regression guards until AICTE supplies traffic volumes and SLOs.

## Test and browser evidence

The final unit/component coverage run passed 234 tests: portal 41, admission application 19, casework 56, admission domain 57, batch ingestion 33 and integration gateway 28. The four digest-pinned PostgreSQL Testcontainers suites passed 52 tests: admission 11, batch 11, casework 21 and gateway 9. OpenAPI, JSON Schemas, lint, strict types and all production builds passed.

The in-app browser acceptance exercised all six human preview roles (institution operator, institution administrator, reviewer, checker, auditor and authorized verifier), every integration-assurance state, and keyboard-only activation at the active 567 × 804 narrow viewport. Document width remained 552 px, so no horizontal overflow was introduced, and browser console output was empty. Earlier Stage 5 acceptance remains the evidence for explicit 390, 768 and 1440 px viewport checks.

## Accessibility evidence

Six axe-core scans cover batch upload as an institution operator; casework as institution administrator, reviewer and checker; and integration assurance as auditor and authorized verifier. The portal suite also checks responsive/keyboard journeys. Automated scans cannot replace manual screen-reader, zoom/reflow, high-contrast, cognitive walkthrough and target-user testing. Required languages and legally reviewed terminology remain authority inputs; UI strings must be externalized before translation begins.

## Security and supply-chain evidence

The security model is deny-by-default, tenant-aware and exercised for all seven roles. The container boundary, recovery harness and provider mock are executable tests. Docker Scout initially found vulnerabilities from the build-only npm CLI and stale pinned-base libraries; the runtime was reduced, the fixed Alpine library versions were explicitly installed and the npm CLI was removed. The rebuilt 64 MB runtime contained 52 indexed packages and reported 0 critical, high, medium or low vulnerabilities. No penetration test or formal privacy-impact assessment is claimed.

## Residual authority blockers

Only protected or accountable inputs remain outside local implementation: official operation schemas and credentials; AICTE approval signing profile; government SSO metadata/claims; notification sender/templates; approved signing/HSM/KMS and revocation policy; hosting/data-residency/network decision; retention/RTO/RPO/SLO targets; legally approved languages/content; representative anonymized data; and authorized users/security assessors for formal validation.
