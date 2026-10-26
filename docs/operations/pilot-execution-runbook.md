# Synthetic pilot execution runbook

This runbook operates Stage 7B only. It does not authorize live institutions or real student data.

## Start sequence

1. Select an immutable Stage 7A configuration and verify its effective window.
2. Record synthetic execution, cohort and operational-owner references.
3. Complete every go/no-go check. Any blocking `FAIL` or `MANUAL_REVIEW` prevents review or start.
4. Retain `PRODUCTION_AUTHORITY_GRANTED=MANUAL_REVIEW`; it is non-blocking only because the execution is explicitly `SYNTHETIC_ONLY`.
5. Maker submits the exact version. A different checker approves it.
6. Start inside the scheduled window. Competing starts use optimistic concurrency; exactly one can win.

## Monitor and stop

Watch submission outcomes, rule trends, pending/outage rates, latency, drift, notification dead letters, casework age, capacity anomalies and worker leases. Apply global, cohort or institution stop controls before investigation. A stop prevents new exposure and never rewrites accepted admissions or capacity reservations.

## Restart safety

Workers claim bounded jobs with `FOR UPDATE SKIP LOCKED`, an expiring lease and an immutable `CLAIMED` receipt. Save the checkpoint with every outcome. An expired lease may be taken by another worker. Retryable failures retain the checkpoint and backoff time; the configured final attempt becomes `DEAD_LETTER`.

## Exit

Stop new work, drain workers, reconcile source = accepted + rejected + pending + casework, verify capacity counters, verify audit/outbox consistency and resolve incidents. Completion produces a technical recommendation with `authorityDecisionRequired=true`.
