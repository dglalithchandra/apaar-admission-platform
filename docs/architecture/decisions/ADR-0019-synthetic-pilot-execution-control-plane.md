# ADR-0019: synthetic pilot execution control plane

## Status

Accepted for Stage 7B on 26 October 2026.

## Decision

Stage 7B extends, rather than replaces, the Stage 7A pilot configuration. An execution pins one immutable pilot configuration version and follows `PLANNED → GO_LIVE_REVIEW → APPROVED → RUNNING`, with controlled pause, incident, resume, completion and termination transitions. Every transition uses optimistic versions, exact idempotency and append-only PostgreSQL history. Advisory transaction locks serialize competing commands.

The only locally available authority mode is `SYNTHETIC_ONLY`. Production authority is always reported as `MANUAL_REVIEW` until accountable evidence is supplied. It is non-blocking only for the explicitly synthetic dress rehearsal; there is no production adapter or feature-flag bypass.

Workers use bounded PostgreSQL jobs, expiring leases, durable checkpoints, immutable attempt receipts, retry limits and dead-letter state. Incidents atomically append the stopped execution version, incident and timeline. Completion atomically appends its execution version, audit/outbox events and immutable report.

Institution evidence is queried through tenant scope. Institution, student, APAAR and admission references are prohibited as public metric labels. Analytics describe technical evidence and never decide admission validity or regulatory rollout.

## Consequences

The repository can prove a production-shaped local dress rehearsal, restart safety and operational controls without representing a real AICTE pilot. Live institutions, provider credentials, legal basis and rollout decisions remain external blockers.
