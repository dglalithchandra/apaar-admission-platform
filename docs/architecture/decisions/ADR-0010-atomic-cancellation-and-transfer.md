# ADR-0010: Atomic cancellation and transfer implementation

- Status: accepted
- Date: 26 October 2026

## Context

An approved cancellation must release all capacity consumed by the accepted admission exactly once. A transfer is more demanding: the target admission must pass the same Stage 1 policy and Stage 2 transactional reservation rules as any other admission, and source capacity must remain held unless the target is accepted. Both actions must preserve the original admission and decision, survive retries and avoid partial audit, outbox or counter writes.

## Decision

Cancellation and transfer execute in a serializable PostgreSQL transaction. The implementation locks in this order: case, source admission, current admission version, source reservations, then the sorted union of source and target capacity-allocation rows. Institution-level capacity rows are also locked in sorted order. This stable order reduces deadlocks; SQLSTATE `40001`, `40P01` and relevant uniqueness races use the repository's bounded retry path.

Cancellation requires an approved `ADMISSION_CANCELLATION` case and an active policy capability named `cancellation`. It decrements each linked capacity counter only when the counter has sufficient used quantity, appends one release-ledger row per reservation, marks the prior admission version non-current and inserts a new current `CANCELLED` version. The original admission and decision remain unchanged.

Transfer requires an approved route-matching case. Same-institution course/programme movement requires `sameInstitutionTransfer`; cross-institution movement requires `crossInstitutionTransfer`. The student and academic year must remain identical and the target route must differ. The existing Stage 2 `SubmitAdmissionService` runs through a client-bound unit of work inside the outer transaction. Only an accepted target permits source release. The source then receives a current `TRANSFERRED` version and the transfer record stores the exact target admission and decision references.

Every command has an institution-scoped idempotency key and request hash. Exact concurrent replay returns the stored receipt; conflicting reuse is rejected. The case transition to `IMPLEMENTED`, receipt, release ledger, admission versions, transfer link, business audit and outbox either all commit or all roll back.

## Consequences

- A failed, rejected, manually reviewed or capacity-exhausted target leaves source capacity and lifecycle unchanged.
- NRI and other multi-bucket admissions release every recorded reservation, not an inferred subset.
- Transfer policy is not duplicated in casework; Stage 1 and Stage 2 remain the source of admission validity and target capacity truth.
- Cross-institution transfer remains blocked by default. The capability name is an implementation hook, not evidence that AICTE has authorised the policy.
- The outer transaction can hold several rows while evaluating the target. Production load testing must measure contention, retry rates and maximum transaction duration before rollout.
