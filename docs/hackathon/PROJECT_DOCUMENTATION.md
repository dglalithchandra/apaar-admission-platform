# NiyamSetu project documentation

## 1. Project identity

**Team:** ASTRAL

**Problem statement:** 26263 — Development of an APAAR ID-Based Student Data Management and Verification Platform for AICTE-Approved Institutions

**Product:** NiyamSetu — Admission Integrity & Policy Registry

NiyamSetu is an independent hackathon prototype. It is not an AICTE or APAAR product and it does not use official government credentials. All included records are fictional and start with `SYNTH-`.

## 2. The problem in plain language

AICTE receives detailed student data from some institutions and aggregate numbers from others. That makes it difficult to answer basic questions consistently: who was admitted, whether the course had an effective approval, which capacity bucket was used, whether the same academic identity appears elsewhere, and who changed a record later.

The challenge is larger than collecting another spreadsheet. A reliable system must keep the decision that was made at the time, survive concurrent submissions for the final seat, separate institution declarations from independently checked evidence, and let an authorized verifier see only the minimum facts needed for a stated purpose.

## 3. What NiyamSetu does

The prototype implements a complete synthetic path:

1. An institution uploads a product-owned CSV and receives a stable receipt.
2. Structural checks, identity simulation and effective approval rules classify every row.
3. Accepted admissions reserve the correct ordinary or scheme-specific capacity in PostgreSQL.
4. Invalid rows receive precise rule codes and correction guidance; uncertain evidence goes to human review.
5. Admissions can be searched by a usable student reference, and the original stored decision remains visible.
6. Correction, cancellation, transfer and appeal requests pass through governed reviewer/checker casework.
7. Capacity counters can be reconciled against the reservation/release ledger.
8. Authorized verifiers receive a purpose-bound, expiring, locally Ed25519-signed receipt containing only allowed claims.
9. Policy Lab replays the same synthetic cohort through a source-aligned baseline and a proposed configuration without writing to the live ledger.

## 4. Central contribution

The central contribution is **source-linked, explainable admission integrity**. Each admission outcome is tied to:

- an effective-dated approval snapshot;
- a versioned ruleset;
- machine-readable findings with plain-language explanations;
- the capacity reservation actually made;
- immutable audit/outbox references; and
- governed history for later changes.

This avoids two weak patterns: a dashboard that notices excess admissions only after the fact, and a mutable student table that loses the reason an earlier decision was made.

## 5. Policy model

The executable baseline comes from the recorded AICTE Approval Process Handbook 2024–27 facts. The important relationships are:

- ordinary admissions consume Approved Intake;
- NRI seats are within Approved Intake, not extra capacity;
- TFW is a separate, non-convertible supernumerary bucket;
- FN/OCI/Gulf, lateral entry and PM-USPY have separate scheme rules and provenance;
- PM-USPY has both course and institution caps;
- excess admissions are blocked before capacity is committed;
- unresolved rounding, evidence or authority questions return review/blocking outcomes instead of invented answers.

For a source-aligned fictional approval of 60 ordinary seats, the default current-rule example uses NRI 3 and TFW 3. Policy Lab labels proposals as configuration scenarios, not authorizations. A hypothetical regulatory amendment is visibly distinct and cannot be imported as current policy.

## 6. Evidence versus declaration

A CSV value such as `VERIFIED` is only an institution declaration. It does not silently become external proof. The model carries evidence provenance separately, so an admission can remain under review until an accountable source and check are recorded. The local academic-identity adapter is deterministic test infrastructure; it is not APAAR verification.

## 7. Architecture

```text
Institution portal
       |
Authenticated versioned gateway
       |
       +-- Batch ingestion and row workers
       +-- Admission application and policy engine
       +-- Governed casework
       +-- Verification and local signing
       +-- Pilot/execution controls
       |
PostgreSQL: approvals, admissions, reservations, cases,
grants, receipts, audit records and transactional outbox
```

The code is a TypeScript workspace with strict package boundaries. The domain engine is side-effect free. Application services depend on ports for approvals, identity verification, time and audit. PostgreSQL adapters own transactions and locking. The gateway composes the modules and the React/Vite portal presents role-specific workflows. Docker Compose provides the reproducible local reference deployment.

### Transaction strategy

- Admission and capacity updates run in the same database transaction.
- Serializable transactions and deterministic locking protect the final seat.
- Idempotency keys return the original result for an identical replay and reject conflicting reuse.
- Audit and outbox records commit atomically with the domain change.
- Rejected or manual-review outcomes consume no capacity.
- Historical decision references are retained rather than recomputed under a later ruleset.

## 8. Technology choices

| Technology                  | Purpose                                          | Why it fits                                                             |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| TypeScript                  | Domain, services, gateway and portal             | One strict type system across contracts and implementation              |
| Node.js 24 / npm workspaces | Runtime and reproducible monorepo commands       | Mature ecosystem and simple local setup                                 |
| React + Vite                | Role-based institutional interface               | Fast build, accessible component testing and small deployment bundle    |
| PostgreSQL 17.6             | Authoritative records and capacity transactions  | Strong constraints, locking, serializable isolation and durable history |
| OpenAPI 3.1 + JSON Schema   | Versioned integration boundary                   | Machine-checkable contracts for institutional ERP integration           |
| Vitest                      | Unit, component and PostgreSQL integration tests | Fast deterministic tests with coverage in every workspace               |
| Testcontainers              | Real disposable PostgreSQL suites                | Exercises actual migrations, SQL, concurrency and rollback behavior     |
| Docker Compose              | Judge/reference deployment                       | Starts the database, migrations, gateway, portal and workers together   |
| Ed25519                     | Local verification receipts                      | Compact independent signatures with restart verification                |
| SHA-256 + Merkle root       | Exported evidence integrity                      | Detects later changes when the root is retained separately              |

The Merkle export is described as tamper-evident snapshot integrity, not blockchain, an official timestamp or proof that the original assertion was true.

## 9. Main user roles

- **Institution operator:** upload, inspect findings and search records.
- **Institution administrator:** institution-level oversight and governed actions.
- **AICTE reviewer:** assess evidence and make a reasoned recommendation.
- **AICTE checker:** independently approve or reject supported actions.
- **Auditor:** inspect scoped history without changing decisions.
- **Authorized verifier:** request only purpose-approved claims.
- **Local system roles/workers:** process durable batch, outbox, notification and pilot work.

The Preview role control exists only in the loopback synthetic environment. It is not production authentication and must not be publicly exposed.

## 10. Judge journey

Start the stack with `npm run judge:start`, open the portal, and follow [JUDGE_GUIDE.md](../../JUDGE_GUIDE.md). The shortest useful journey is:

1. Upload `contracts/fixtures/synthetic/judge-practice.csv` as Institution operator.
2. Inspect one accepted row, one missing-field row and one category-evidence review.
3. Search `SYNTH-JUDGE-STUDENT` under Admissions and open the stored decision.
4. Download the evidence bundle and retain its displayed root separately.
5. Open Casework as reviewer/checker to inspect the governed state machine.
6. Open Policy Lab as reviewer and compare the 60/3/3 baseline with the clearly unapproved 80/4/4 example.
7. Open Integration assurance as Authorized verifier and issue the scoped local receipt.

Repeated file uploads return the original receipt. Existing database state can change an expected acceptance into a duplicate or capacity rejection; judges should not erase data merely to manufacture a successful result.

## 11. Testing evidence

On 30 October 2026 the final working tree produced these results:

- 347/347 unit and component tests passed through `npm run check`;
- admission-domain and casework packages retained 100% statement/branch/function/line coverage;
- 17/17 admission-application PostgreSQL tests passed;
- 11/11 batch-ingestion PostgreSQL tests passed;
- 21/21 casework PostgreSQL tests passed;
- 25/25 gateway PostgreSQL tests passed;
- OpenAPI and JSON Schemas validated;
- production builds completed for every workspace;
- the connected Compose journey passed seven roles, persistence after restart, duplicate rejection, cancellation/readmission, reconciliation, printable record and public-key verification after restart;
- `npm audit --audit-level=high` reported zero vulnerabilities.

These results use synthetic local data and real PostgreSQL containers. They do not establish usability with admissions staff, formal accessibility certification, performance at national scale or approval by a regulator.

## 12. Security and privacy approach

- No real names, Aadhaar values, contact details or official credentials belong in Git.
- Sample identifiers are `SYNTH-` prefixed.
- Verification requires a stored recipient, purpose, claim scope and expiry.
- The portal displays original decision evidence rather than inventing a historical replay.
- Search and analytics are advisory; they do not reserve or release seats.
- The local profile binds to loopback and must not be tunneled to the public internet.
- Production configuration fails closed if local reference sessions or simulators are enabled.

## 13. Known limitations

- Official APAAR, AICTE SSO, approval feeds and notification gateways are not connected.
- Local reference roles are not a production authentication system.
- No real institution or student data was used.
- No admissions-staff usability study has been completed; study materials exist for later work.
- Safe public hosting is blocked on evaluator isolation and real application authentication.
- The Ed25519 issuer is local and synthetic, not a government issuer.
- The evidence root is not currently published to a trusted timestamp service.
- National load, disaster-recovery objectives and regulatory operating procedures need accountable owners and real infrastructure.

## 14. Future scope

After official access and policy authority are available, the next steps are:

1. replace the academic-identity simulator with the approved APAAR/API Setu adapter;
2. replace reference sessions with real OIDC/SSO, server-side tenant membership and evaluator isolation;
3. ingest signed/effective AICTE approval data with accountable amendment workflow;
4. conduct observed usability sessions with admissions staff and incorporate measured findings;
5. perform representative load, recovery, privacy and security assessments;
6. add approved notification providers and retention/consent operating controls;
7. consider a trusted timestamp/transparency-log publication for retained evidence roots.

## 15. Claims that must not be made

Do not say that NiyamSetu is endorsed by AICTE, connected to live APAAR, proven at national scale, tested with real students, guaranteed to prevent all fraud, or authorized to change seat policy. The honest achievement is a working, tested technical foundation that contains those trust boundaries instead of hiding them.

## 16. Key references in this repository

- [Judge guide](../../JUDGE_GUIDE.md)
- [Current evidence register](CURRENT_EVIDENCE.md)
- [System context](../architecture/system-context.md)
- [Policy fact register](../research/approval-policy-fact-register.md)
- [Policy/evidence boundary ADR](../architecture/decisions/ADR-0024-handbook-capacity-and-evidence-boundaries.md)
- [OpenAPI contract](../../contracts/openapi/apaar-platform.yaml)
- [Current walkthrough](ASTRAL_NiyamSetu_Current_Walkthrough.mp4)
- [Narration script](ASTRAL_NiyamSetu_Current_Video_Script.md)
