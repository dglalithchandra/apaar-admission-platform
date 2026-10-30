# NiyamSetu demo narration

**Target duration:** about 2 minutes 20 seconds

**Speaking style:** calm, conversational and clear. Do not rush identifiers on screen; they are evidence, not lines to read aloud.

## 0:00–0:20 — The problem and the upload

AICTE needs reliable student-level admission records, but institutions submit data in different ways, and a simple upload cannot prove that every seat follows the applicable rules. NiyamSetu turns that upload into a traceable admission decision.

Here, an institution uses the standard CSV workflow. The file contains synthetic identifiers only. Once it is submitted, the platform returns a permanent receipt instead of silently replacing the previous data.

## 0:20–0:44 — Actionable row results

The result is explained row by row. One record is accepted, one has a missing required field, and one needs human review because an institution's declaration is not the same as independently checked evidence.

This is important because the platform does not pretend that every `VERIFIED` value in a spreadsheet is trustworthy. Staff receive a precise rule code and a correction path, so they know what to fix.

## 0:44–1:08 — Stored decision evidence

An admission can then be found using the student reference. The stored decision shows the exact ruleset, approval source, findings, and history that produced the result. It is not quietly recalculated later under a different rulebook.

For external review, the evidence bundle includes section checksums and a Merkle root. That does not prove a government timestamp, but it does make later changes detectable.

## 1:08–1:20 — Governed corrections

If a record must be corrected or cancelled, it enters casework. The reviewer, policy version, current state, and latest action remain visible. This keeps an important change from becoming an untracked database edit.

## 1:20–1:47 — Policy Lab

Policy Lab answers a different question: what changes if an approved configuration changes? The source-aligned baseline is kept separate from a proposal, and the proposal is clearly marked as not authorized.

The replay is deterministic, not an AI guess. Every changed outcome points back to a machine-readable rule code, and the simulation never consumes a real seat or writes to the admission ledger.

## 1:47–2:20 — Purpose-bound verification and close

Finally, access depends on the user's role. A reviewer is denied the verifier-only workflow. An authorized verifier receives only the allowed claims, for the recorded purpose and recipient, with an explicit expiry.

The receipt shown here is signed with Ed25519 by the local synthetic issuer. We are not claiming a live APAAR or government connection. Those integrations require official authority. What this prototype proves is the complete technical path around them: controlled ingestion, explainable policy decisions, governed changes, tamper-evident evidence, and limited verification.

That is NiyamSetu: verify the record, apply the rule, and protect the seat.

## Recording notes

- The supplied MP4 is a captioned edit of current live-application captures. Record this narration separately if an audio track is required. The pointer highlight in the edit is a visual guide, not a recording of an actual mouse movement.
- Say “synthetic” once near the beginning and state the official-integration boundary clearly near the end.
- Do not call the Policy Lab output a forecast or an authorization.
- Do not read receipt IDs, hashes or internal references aloud.
- Pause briefly after “rule code,” “Merkle root,” and “explicit expiry” so the visual can land.
