# Controlled pilot operations runbook

This runbook applies only to the synthetic Stage 7A capability. It does not authorize a real AICTE or APAAR pilot.

## Institution onboarding

1. Confirm the institution and every campus exist in the approved master source. PostgreSQL rejects a campus outside the configured institution.
2. Record cohort, effective dates, capability allow-list, template/API versions and conservative daily and batch limits.
3. Provision purpose-limited roles and verify institution tenant isolation.
4. Complete a legacy-data dry run, explicit corrections and a zero-drift reconciliation.
5. Record approval-data, dependency, security and recovery readiness. Any failure or manual-review item blocks activation.
6. Have a checker other than the maker activate the exact reviewed version during its effective window.

## States and gates

`DRAFT → READY → ACTIVE → PAUSED/INCIDENT → ACTIVE → EXITED` is the normal shape. Configuration and expansion return to `DRAFT`; only all-pass assessment produces `READY`. Optimistic versions reject stale commands. Server-side capability checks fail closed unless state is `ACTIVE` and both kill switches are off.

## Pause, incident and recovery

Pause stops new pilot exposure and does not modify accepted records. For provider outage, security concern, capacity anomaly, reconciliation drift or audit/outbox failure, enable the relevant kill switch and declare `INCIDENT`. Preserve correlation and receipt references without copying student values into incident tools. Diagnose against synthetic or approved redacted inputs, verify database and outbox consistency, rerun readiness gates, turn switches off and have an authorised checker resume. Never interpret an identity-provider outage as an invalid identity.

## Controlled expansion

Pause first. Add only campuses belonging to the same approved institution. Expansion creates a new draft, clears the earlier checker approval and requires migration reconciliation, readiness and independent activation again. A direct active-cohort expansion is rejected.

## Exit

Stop new work, drain workers, reconcile admission, migration, notification and casework totals, and require zero unresolved drift. Append the exit transition and retain configuration, assessment, receipt, audit and outbox history under the approved retention schedule.

## Locally verified versus authority required

Local tests verify state transitions, locking, immutable history, tenant checks, synthetic migration, pause/resume and recovery mechanics. A real cohort, named operational owners, production SLOs, approved retention, API credentials, legal basis, consent language, official branding and go/no-go authority remain blocked by the external register.
