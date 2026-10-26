# Authenticated integration gateway

This Stage 5 package hosts the local production-shaped HTTP, authentication and external-integration boundary. It delegates regulatory decisions to the existing Stage 1–4 services.

Implemented and locally verifiable:

- public health/readiness and auditor-only dependency status;
- synthetic-test, local Ed25519 OIDC/JWKS and injected production OIDC bearer authenticators;
- deny-by-default role and institution-scope authorization;
- bounded JSON transport, correlation IDs, rate limiting and stable problem responses;
- deterministic APAAR simulator plus an HTTPS-only adapter whose request/response translator must be supplied from an approved contract;
- digest-verified approval manifests with explicit authority, exact replay, named supersession and PostgreSQL scope constraints;
- leased, retryable/dead-letter informational notifications with duplicate-claim protection;
- minimal, expiring, revocable verification receipts and a visibly synthetic signing adapter;
- migrations `0004_authenticated_integrations.sql` and `0005_operational_assurance.sql` plus real digest-pinned PostgreSQL 17.6 tests;
- complete recorded OpenAPI operation inventory, response-status enforcement, security events and auditor-only Prometheus metrics.
- controlled-pilot configuration, server-side fail-closed capabilities, readiness gates, maker-checker activation, kill switches, synthetic legacy migration and immutable PostgreSQL rollout history.

Purpose-limited verification uses the `Idempotency-Key` request header defined by the OpenAPI contract. Approval imports use their manifest `importReference` plus content digest as the replay key; an authoritative overlap is accepted only when it explicitly names the one active import it supersedes.

Live APAAR, AICTE approval feed, OIDC, notification and signing integrations remain disabled until the external blocker register is satisfied.

Run `npm run test:e2e:gateway` for the pinned PostgreSQL suite. Run `npm run test:container` for the hardened runtime smoke test. See the integration runbook and Stage 6 assurance report for load, recovery and operational commands.

Run `npm run test:e2e:pilot` for the isolated Stage 7A PostgreSQL suite. These controls remain synthetic and do not activate real institutions.
