# ADR-0024: Handbook capacity and category evidence boundaries

Accepted 29 October 2026. Supersedes the baseline assumptions in ADR-0021; complements ADR-0006 and ADR-0022.

## Correction and source

The previous Policy Lab fixture supplied 60 ordinary seats, NRI 5 and TFW 6. The transactional seed correctly used 3 and 3. The source-confirmed register cites the AICTE Approval Process Handbook 2024–27, PDF pages 34–35, 70–71, 75–76. NRI is within intake; TFW is separate and non-convertible. A supplied absolute quantity is not evidence that a regulatory ceiling changed.

`validateApprovalCapacity` is shared by the pure engine, the import service and the concrete PostgreSQL writer. It checks safe whole quantities, parent/subgroup bounds, NRI 5%, TFW 5%, FN/OCI/Gulf 15% and thirds, foreign nationals across routes 15% (including lateral routes), lateral 10% plus declared first-year vacancies, PM-USPY two per course/ten per institution, source period and non-empty provenance. Admission evaluation retains regular-mode, programme, approval, fill-condition, category and occupied-capacity rules. Import is refused on either errors or unresolved source policy before connecting/writing.

No rounding or subgroup-transfer authority record has been supplied. Fractional ceilings, altered subgroup splits, absent provenance and years outside the source period are UNKNOWN_BLOCKING review findings. A non-empty authority label cannot override a percentage. A vacancy count exceeding the current snapshot intake requires review of the originating-year approval; the current intake is not invented as a statutory ceiling on prior-year vacancies. Previously recorded historical decisions are not re-written. The generic integration-gateway manifest endpoint archives integrity-checked manifests; its receipt is not activated approval capacity. The transactional snapshot import remains the activation boundary.

## Three distinct policy contexts

1. Source-confirmed regulatory baseline, with the source edition, pages and applicable academic years. The showcase approval is fictional, effective 1 January 2026, and explicitly labelled synthetic.
2. Proposed course configuration under those existing rules. Meeting ceilings is necessary, not proof that AICTE approved the proposal.
3. Explicit hypothetical amendment with reference, rationale and proposed percentages. Only the simulation passes this context to the pure engine. Neither approval import nor the admission application service accepts an amendment argument. The UI says NOT AUTHORIZED. This initial experiment can vary NRI/TFW percentages only.

The default proposal is intake 80/NRI 4/TFW 4; other allocations are unchanged. At zero initial occupancy, the fixed 84-record cohort yields baseline 65 accepted/17 rejected/2 review and proposal 73/9/2. These are calculated outcomes, not targets, forecasts or measured national benefits. The literal arithmetic is checked independently of the simulator. Every result exposes the complete input cohort, order, occupancy, both approval snapshots, amendment if any, source and ruleset version. Replay requires the same version; a later ruleset is not guaranteed to reproduce it.

## Category evidence trust boundary

`eligibilityEvidence` in CSV 1.0 remains an institution declaration. VERIFIED is normalized to PENDING; the raw row and declaration origin/status remain in the audit context. Identity verification is a separate assessment and cannot verify category eligibility.

The internal admission model adds optional `categoryEvidenceCheck` with reviewer, evidence reference, time and method. A special-category VERIFIED status without that record requires review. Fixture checks explicitly use SYNTHETIC_FIXTURE and SYNTH references; they are not external verification. INDEPENDENT_REVIEW denotes a trusted service assessment, not proof inferred from its text. No public upload contract accepts the check object. A future evidence-review endpoint must authenticate/authorize the reviewer and resolve stored evidence server-side; do not forward a client-supplied check object.

The public CSV shape and schema identity remain compatible; its trust semantics are tightened. The new internal check schema is version 1. Application validation profile is `handbook-evidence/3`; ruleset is `2026.10-handbook-capacity-2`. Additive migration 0017 persists the check as JSONB on immutable admission commands. No historic evidence is fabricated or backfilled.

## Simulation and limits

Simulation holds independent in-memory counters, has no repository dependency, and does not call a live verifier. It lists real finding codes and before/after explanations; long transition lists expand in the UI. A PostgreSQL integration test compares command, decision, reservation, audit, outbox and ordinary-counter state before and after simulation. Inputs are preserved and a recorded-input replay must match exactly.

Live authority verification, accountable rounding configuration, authorized subgroup transfer events, production evidence review and reassessment of historic decisions remain separate work. Review rather than invented permission is intentional.
