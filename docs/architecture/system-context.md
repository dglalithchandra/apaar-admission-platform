# System context

## Core flow

1. AICTE approval data creates a versioned capacity snapshot for an institution, campus, programme and academic year.
2. An institution enters or uploads admission records with an idempotency key.
3. The ingestion service validates structure and records a receipt before asynchronous checks begin.
4. Identity linking verifies APAAR through the external adapter or records a clearly classified pending/exception state.
5. The admission engine applies approval, capacity, category, lifecycle and concurrency rules in one transaction.
6. Conflict detection compares the person and admission period across institutions and opens a case when human review is required.
7. Accepted admissions receive an Admission Registration Reference and emit an outbox event.
8. Dashboards and search are built from accepted events but can be reconciled against the authoritative database.
9. Authorised verifiers request only purpose-limited facts and receive a time-bound verification receipt.

## Trust boundaries

- Institution systems and uploaded files are untrusted inputs.
- APAAR/API Setu is an external authority whose outages and contract changes must be contained by an adapter.
- AICTE approval imports are authoritative only after source, signature/hash, effective date and import approval are recorded.
- Search, analytics and machine-learning outputs are advisory derived data.
- Human reviewers are privileged actors; every read and decision involving personal data is auditable.

## Authoritative stores

- PostgreSQL holds approvals, admissions, cases, consent/legal-basis records and audit references.
- Object storage holds uploaded evidence with malware status, encryption and retention metadata.
- The outbox table is committed with domain changes and later published to the event stream.
- OpenSearch is disposable and rebuildable.

## First vertical slice

One institution uploads a versioned CSV against a synthetic approval snapshot. The service returns a receipt, validates rows, simulates APAAR responses, protects the last available seat, exposes a correction file and shows the reconciled result to an AICTE-style reviewer. This proves the risky core before national dashboards or credential issuance.

## Stage 5 integration boundary

One authenticated gateway terminates versioned HTTP requests and converts trusted OIDC claims into the product principal. It delegates admission and casework decisions to the existing services. APAAR, approval feeds, notification gateways and signing are replaceable adapters; they are disabled or synthetic until their official contracts and credentials are approved. Health/readiness expose dependency classes only. Verification returns a minimal expiring receipt for an explicit purpose and legal basis.

## Stage 6 assurance boundary

Container, load, recovery, accessibility and security-supply-chain harnesses exercise this architecture locally without adding another source of regulatory truth. Metrics and security events observe decisions but cannot make them. The compose stack is a disposable synthetic environment; production hosting, secrets, cryptographic authority, national traffic targets and recovery objectives remain outside the repository until their accountable owners provide them.
