# Observability and incident signals

The gateway emits Prometheus text at auditor-only `GET /metrics`. Labels are limited to method, normalized route and status. Dynamic path segments, including pilot and migration references, become `:reference`; query strings, bodies, tokens, APAAR values and student/institution identifiers are never labels.

Stage 7A also defines low-cardinality pilot signals for submission outcome, validation/rejection trend, identity-provider pending/outage, processing latency, reconciliation drift, notification dead letter, casework backlog and capacity anomaly. Signal and outcome are the only metric labels. Institution-scoped dashboards enforce tenant scope at the authorised query layer rather than placing institution IDs in time-series labels.

Recommended initial signals are request rate, error ratio, latency percentiles, readiness state, provider circuit state, approval-import rejection, notification retry/dead-letter count, case-version conflicts, serialization retries, capacity rejection and outbox lag. Only the first three are implemented as local gateway counters; production exporters and alerts require the selected hosting stack.

Proposed alerts must be calibrated with real baselines. Immediate pages should cover authorization leakage, signature verification failure, inability to reserve/release capacity atomically, database unavailability and audit/outbox write failure. Ticket-level alerts can cover sustained latency, provider degradation, notification dead letters and reconciliation drift.

Security events record sanitized routes, actor/organization references when already authenticated, correlation reference, result and stable reason code. They are append-only in PostgreSQL. Operational logs must use the same redaction rule and access to them must itself be audited.
