# Batch-ingestion operations runbook

## Normal journey

1. The institution downloads template 1.0, uploads a UTF-8 CSV and supplies actor, reason, request and idempotency references.
2. The service stores bounded bytes through the object-storage port, records SHA-256, returns an immutable receipt, scans, parses and persists rows.
3. A worker claims rows in bounded groups. Each valid row calls the Stage 2 admission service after academic-identity verification.
4. Operators read reconciled totals from row states. `COMPLETED` means every row was accepted; `NEEDS_ACTION` means at least one terminal row requires correction/review; `PROCESSING` includes retryable work.

Receipt creation means the file was registered, not that any admission was accepted.

## Retry and resume

- `VALID` and `FAILED_RETRYABLE` rows are claimable. Terminal accepted, rejected, manual-review and final-failure rows are not.
- A lease lasts 60 seconds in the application component. On the next claim, an expired attempt is closed and the row becomes retryable, or final after attempt three.
- Identity rate limiting and temporary outage are retried up to three total attempts. They never become `NOT_FOUND` by inference.
- If a worker fails around Stage 2 commit, resend the deterministic Stage 2 command. Its idempotency record returns the original decision and prevents a second seat reservation.
- Registration automatically retries PostgreSQL serialization and deadlock failures up to three times. Persistent database failure is surfaced; do not change the idempotency key during an operational retry.

## Correction workflow

Download the correction CSV only from an authorised batch view. Keep the immutable receipt reference. Correct the institution source of truth, then create a new upload. Do not manually update `batch_rows`, admissions, decisions or capacity counters.

## Failure triage

- `FAILED` batch: inspect batch findings for scanner, encoding, structure or file-limit codes. The rows were not processed.
- `FAILED_RETRYABLE`: dependency failure or interrupted work remains within the retry budget.
- `FAILED_FINAL`: retry budget is exhausted or processing repeatedly failed; route to authorised operational review.
- `MANUAL_REVIEW`: a business decision requiring authority, not a system error.
- totals disagree: stop workers and investigate; `batch_reconciliations` has a sum constraint and is always recomputed from authoritative rows.

Never put uploaded rows or academic-identity references in logs or support tickets. Use batch, receipt, record-key, request and correlation references.

## Current local commands

- `npm run test:e2e:batch` starts pinned `postgres:17.6-alpine` through Testcontainers and exercises migration, processing, retry, concurrency, capacity, audit and outbox behavior.
- `npm run storybook -w @apaar-platform/institution-portal` reviews UI states.
- The malware and identity adapters are deterministic simulators only. They provide no production assurance.
