# ADR-0020 — Integrated PostgreSQL reference composition

## Status

Accepted on 27 October 2026 for the synthetic reference environment.

## Context

Stages 1–7B proved their boundaries independently. A useful deployment must also prove that the real portal, HTTP gateway, PostgreSQL repositories, asynchronous work and operational event delivery compose without replacing domain rules with demo data.

## Decision

The reference deployment uses one PostgreSQL database, one migration/seed path, the production gateway composition root, four independently runnable worker processes and a same-origin portal proxy. The portal obtains local role sessions from a synthetic-only endpoint; startup rejects that mode outside the reference environment. Batch work, outbox publication, notification dispatch and pilot monitoring have isolated process failure domains and persist leases or checkpoints plus role-specific heartbeats. The outbox remains the atomic boundary for operational-event publication, while the append-only event stream provides monotonic cursor replay and tenant-aware reads.

All business decisions continue to execute in the existing application, batch, casework and pilot services. The composition layer may translate HTTP and persistence representations but must not duplicate policy. Uploaded objects are represented by encrypted-storage metadata in the local reference database; production object-store selection remains an authority deployment decision.

## Consequences

- `docker compose -f infra/compose/compose.yaml up --build --wait` starts the complete synthetic path at `http://127.0.0.1:5173`.
- PostgreSQL migrations `0008` and `0009` add only reference-runtime state and compatibility; previously applied migrations remain unchanged.
- Restart tests prove durable receipts, case state and event cursors rather than process-memory recovery.
- Synthetic sessions, the identity simulator and deterministic seed data are prohibited production substitutes.
- Live APAAR, AICTE, notification, signing, hosting and policy authority remain blocked by the external-input register.
