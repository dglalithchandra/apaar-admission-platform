# Stage 7B integrated reference deployment assurance

## Scope

This stage connects the already-tested admission, batch, casework, verification and pilot capabilities into one executable synthetic deployment. It does not claim a live government integration, real pilot or production authorisation.

## Executable topology

The pinned PostgreSQL 17.6 container is migrated and deterministically seeded before the gateway starts. The gateway uses real PostgreSQL repositories and existing domain/application services. Four independently runnable workers handle batch jobs, outbox publication, notification delivery and pilot jobs; each publishes a dedicated health heartbeat and can be restarted without taking down the other roles. The portal serves its production Vite bundle and proxies `/v1` requests to the gateway, so browser journeys use the same API boundary as automated tests.

The stack has health checks, non-root Node processes, read-only application filesystems, dropped Linux capabilities, no-new-privileges and explicit loopback port bindings. The database volume intentionally survives application restarts. `reference:reset` is a development-only destructive reset and never runs on normal startup.

## Connected journey

`npm run test:full-system` proves synthetic role sessions, template download, a mixed batch, temporary identity-provider outage classified for manual review, exact idempotent replay and conflict, maker-reviewer-checker casework, atomic implementation, purpose-limited verification, pilot-readiness evidence, durable operational events and application restart persistence. The focused PostgreSQL suites remain the source of detailed last-seat, rollback, lease and concurrency evidence.

The final integrated run produced one accepted row, three manual-review rows, an implemented cancellation case, a completed synthetic execution, 61 durable events and a successful gateway plus four-worker restart. Browser acceptance against `http://127.0.0.1:5173` exercised the live PostgreSQL-backed reviewer queue, independent checker view, pilot control plane, readiness, provider-outage classification and an active minimum-disclosure verification receipt. Browser testing found and fixed an unbound Fetch invocation, an incorrect verifier token on the institution-only identity route and a missing deterministic admission referenced by the verification journey.

## Operational boundaries

Readiness depends on PostgreSQL and fresh worker heartbeats. Operational events use an increasing cursor and can be replayed as JSON or finite server-sent-event output. Tenant users see only events attributed to their institution; AICTE/auditor roles can inspect cross-tenant operational evidence. Metrics never contain student identifiers.

## Remaining authority gates

Real OIDC issuer metadata, APAAR/API Setu credentials, the authoritative AICTE approval feed, notification sender approval, signing/HSM policy, hosting controls, retention, SLO/RTO/RPO, legal basis, branding and real-institution participation are not available. Their adapters remain disabled or synthetic, and `PRODUCTION_AUTHORITY_GRANTED` remains `MANUAL_REVIEW`.
