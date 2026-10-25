# Batch-ingestion service

Stage 3 application components for product-owned CSV template 1.0. This package owns registration, safe parsing, row workflow, leases, retries, reconciliation and correction export. It delegates every admission decision and seat reservation to `@apaar-platform/admission-application`.

## Boundaries

- `CreateBatchService` validates request metadata, bounds and hashes content, uses object-storage and malware-scanner ports, registers the receipt and saves parsed rows.
- `BatchWorker` verifies an opaque academic identity through a replaceable port and calls the Stage 2 service with deterministic row command/idempotency values.
- `BatchQueryService` exposes transport-neutral summaries, row results, template content and correction content.
- `PostgresBatchRepository` implements receipt/digest idempotency, `SKIP LOCKED` claims, 60-second leases, three attempts, immutable decision links and row-derived reconciliation.

Migration order is `0001_admission_foundation.sql` from Stage 2 followed by `0002_student_batch_ingestion.sql`. The second migration adds receipts, request aliases, state history, findings, rows, attempts, reconciliation and correction-export metadata, plus immutability triggers for receipts, append-only records and terminal row decision references.

No HTTP framework is introduced in Stage 3. The OpenAPI document defines the transport DTOs; it does not expose database rows. Authentication and route hosting remain an authorised-integration concern, not an empty server shell.

See the [template contract](../../docs/product/csv-template-v1.0.md), [architecture decision](../../docs/architecture/decisions/ADR-0007-resumable-postgresql-batch-ingestion.md) and [runbook](../../docs/operations/batch-ingestion-runbook.md).

## Test commands

- `npm run test -w @apaar-platform/batch-ingestion`
- `npm run test:coverage -w @apaar-platform/batch-ingestion`
- `npm run test:e2e:batch` — real pinned PostgreSQL; Docker is mandatory.
