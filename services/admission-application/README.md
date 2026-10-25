# Admission application and PostgreSQL adapter

This module connects the existing admission-domain policy engine to PostgreSQL. It contains no HTTP framework and no real APAAR integration.

## Responsibilities

- import immutable, effective-dated approval snapshots and explicit capacity allocations;
- execute institution-scoped idempotent admission commands;
- lock and read current usage, then invoke the domain engine;
- persist accepted, rejected and manual-review decisions;
- reserve all required counters only for accepted decisions;
- append a minimal business audit event and transactional outbox event.

The audit and outbox payloads contain references and decision metadata, not complete student identifiers or request payloads.

## Local commands

Copy `.env.example` to an ignored `.env` only for local use and replace the synthetic placeholders through your secret mechanism. The process reads:

- `DATABASE_URL` (required);
- `DATABASE_SSL` (`true` or `false`);
- `DATABASE_MAX_CONNECTIONS` (1–100);
- `DATABASE_STATEMENT_TIMEOUT_MS` (1000–120000);
- `DATABASE_APPLICATION_NAME` (safe identifier characters only).

Run migrations with `npm run db:migrate -w @apaar-platform/admission-application`. Run the real PostgreSQL suite from the repository root with `npm run test:integration:postgres`. It starts pinned PostgreSQL through Testcontainers and refuses alternate in-memory databases.

The deployment database role should have connect and DML rights only for this schema. A separately controlled migration role should own schema changes. Neither role should be a PostgreSQL superuser. TLS and credential injection are deployment responsibilities.

## Verified local persistence boundary

The pinned `postgres:17.6-alpine` Testcontainer runs on Docker Desktop's WSL 2 Linux engine. On 25 October 2026 the 11-test suite passed, including empty and repeat migration, effective approval supersession, scheme-specific reservations, atomic rollback, identical and conflicting idempotency replays, immutable history and concurrent competition for the final seat.

This verification does not replace production load tests, managed-database failover testing, backup restoration, connection-pool sizing or deployment-specific TLS and credential controls.
