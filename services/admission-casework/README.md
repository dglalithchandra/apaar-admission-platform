# Admission casework service

This Stage 4 workspace owns governed post-admission casework. It does not alter Stage 2 admission decisions in place and does not duplicate the admission-capacity policy engine.

## Implemented foundation

- case types, lifecycle states and deterministic transition findings;
- role and institution-scope authorization boundaries;
- correction-field impact classification;
- explicit authority blocking and maker-checker separation;
- PostgreSQL case creation, retrieval and transition primitives with idempotency, audit and outbox writes;
- serializable case commands with exact stored replay results, optimistic versions and bounded serialization/deadlock retry;
- versioned draft changes, submission, withdrawal, reviewer assignment/reassignment, conflict declarations, information request/response cycles, recommendation and independent checker decisions;
- correction proposals with derived policy/capacity/identity impact, safe evidence metadata and purpose/legal-basis records;
- atomic appeal creation, independently checked appeal outcomes that do not implement remedies, institution-isolated retrieval, filtered listing and stable pagination;
- migration `0003_admission_casework_governance.sql` for effective policy versions, cases, assignments, recommendations, decisions, corrections, evidence metadata, conflicts, appeals, purpose records, admission versions, implementations, releases and transfers;
- database guards for active-policy authority and overlap, active-case and appeal uniqueness, valid versioned transitions, immutable regulatory history, independent decisions, appeal ownership, admission-version lineage and implementation-once behavior.
- governed cancellation that locks the approved case, source admission/version, reservation ledger and capacity counters before releasing each reservation exactly once and appending a cancelled version;
- governed same- and cross-institution transfer that uses the real Stage 2 submission service inside the outer transaction, reserves accepted target capacity before releasing source capacity and links exact target decision provenance;
- explicit authority capabilities (`cancellation`, `sameInstitutionTransfer`, `crossInstitutionTransfer`) that block implementation unless an active authority-backed policy sets the relevant capability to `true`;
- OpenAPI `0.3.0-draft`, strict JSON Schema and a schema-validated all-synthetic contract journey for the case lifecycle and implementation receipts.

Run unit coverage with:

```text
npm run test:coverage -w @apaar-platform/admission-casework
```

Run the real PostgreSQL foundation suite with Docker available:

```text
npm run test:e2e:casework
```

The suite uses pinned `postgres:17.6-alpine` and synthetic `SYNTH-` records only.

## Deliberate production boundaries

Stage 4 is complete at the domain, persistence, contract and synthetic-portal boundary. The HTTP contract is defined, but a production transport, authentication claims and approved external integrations belong to Stage 5. Appeal-remedy execution remains an intentionally separate command and is not implemented. Cross-institution transfer and any cancellation deadline remain blocked unless an explicit authority-backed policy is configured; the service must not invent those rules.
