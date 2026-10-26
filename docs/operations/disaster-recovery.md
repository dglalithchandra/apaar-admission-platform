# Disaster-recovery baseline

`npm run test:recovery` starts digest-pinned PostgreSQL 17.6, creates a synthetic record, verifies that the migration and runtime group roles are non-login/non-superuser, takes a logical dump, removes the test table, restores the dump and compares the recovered value. The 26 October 2026 local run passed in 4.447 seconds.

This proves command correctness and logical recoverability only. It does not establish production RTO or RPO.

Production requires encrypted scheduled backups, cross-failure-domain copies, retention and legal-hold rules, restoration into an isolated network, checksums, migration compatibility checks, reconciliation of approval capacity/admissions/audit/outbox, key and secret recovery, and a signed recovery record. Restoration must be rehearsed at an owner-approved frequency. The external blocker register records that hosting, retention, RTO and RPO are still authority decisions.

After a recovery, do not reopen writes until:

- every migration version is present exactly once;
- accepted reservation totals reconcile to immutable admission decisions;
- no capacity counter exceeds its effective approval;
- audit and outbox sequences have no unexplained gap;
- receipt signing and revocation stores are available;
- identity and notification dependencies either pass readiness or remain explicitly degraded.
