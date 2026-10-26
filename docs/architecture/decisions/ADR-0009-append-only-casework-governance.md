# ADR-0009: Append-only casework governance and admission versions

- Status: accepted
- Date: 25 October 2026

## Context

Correction, cancellation, transfer and appeal must not rewrite the admission or regulatory decision that originally occurred. A later action needs its own authority, actors, reasons and implementation receipt. Case processing also needs optimistic concurrency, institution isolation and independently activated policy versions without turning proposed configuration into official policy.

## Decision

PostgreSQL migration `0003_admission_casework_governance.sql` adds a case aggregate with explicit lifecycle states and an integer version. Database guards permit only documented state transitions with a version increment. One active case of a type may exist for an admission, one reviewer assignment may be active, and one pending appeal may target a case or decision.

Case state history, recommendations, decisions, correction changes, evidence metadata, conflict declarations, purpose records, implementation receipts and capacity-release entries are append-only. Assignments may only move once from active to ended. An appeal request is immutable, while its outcome may be recorded exactly once. A decision's maker must be the maker stored on the case and its checker must be different.

Policy versions are effective-dated and scoped. Only `SOURCE_CONFIRMED` or `AUTHORITY_CONFIGURED` versions can be activated, and activation requires different maker and checker references. Exclusion constraints reject overlapping active ranges for the same policy and canonical JSON scope. Activated versions cannot be changed or deleted, and cases can reference only a currently effective active version with matching authority.

Admission changes create linked `admission_versions`. Exactly one version may be current, the predecessor must be the immediately preceding version of the same admission, and historical content cannot be mutated. Moving the current marker from true to false is the only permitted update; creating the successor is a separate insert in the same future implementation transaction.

Every repository mutation runs in a serializable transaction with an institution-scoped idempotency key and request hash. The command stores the exact returned case snapshot, so replay returns the historical command result even if the case has subsequently advanced. Reuse for different content is rejected. State and expected-version validation occurs after replay lookup. Each successful mutation writes case history, business audit and outbox records in the same transaction; a failure rolls all of them back.

## Consequences

- Original Stage 2 admissions and decisions remain intact and reproducible.
- PostgreSQL rejects several classes of application defect even if a service path is bypassed.
- Cancellation and transfer must use explicit implementation transactions and capacity-release ledgers; direct edits remain prohibited.
- Effective policy lookup uses the database date at case creation. Production deployment must keep database time synchronized and must test policy-boundary dates.
- This ADR does not authorize a cancellation deadline, cross-institution transfer or other unresolved rule. Such actions remain `UNKNOWN_BLOCKING` until an authority-backed version is activated.
