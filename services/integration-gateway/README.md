# Authenticated integration gateway

This Stage 5 package hosts the local production-shaped HTTP, authentication and external-integration boundary. It delegates regulatory decisions to the existing Stage 1–4 services.

Implemented and locally verifiable:

- public health/readiness and auditor-only dependency status;
- synthetic-test and injected OIDC bearer authenticators;
- deny-by-default role and institution-scope authorization;
- bounded JSON transport, correlation IDs, rate limiting and stable problem responses;
- deterministic APAAR simulator plus an HTTPS-only adapter whose request/response translator must be supplied from an approved contract;
- digest-verified approval manifests with explicit authority, exact replay, named supersession and PostgreSQL scope constraints;
- retryable/dead-letter informational notifications;
- minimal, expiring, revocable verification receipts and a visibly synthetic signing adapter;
- migration `0004_authenticated_integrations.sql` and real `postgres:17.6-alpine` tests.

Purpose-limited verification uses the `Idempotency-Key` request header defined by the OpenAPI contract. Approval imports use their manifest `importReference` plus content digest as the replay key; an authoritative overlap is accepted only when it explicitly names the one active import it supersedes.

Live APAAR, AICTE approval feed, OIDC, notification and signing integrations remain disabled until the external blocker register is satisfied.

Run `npm run test:e2e:gateway` for the pinned PostgreSQL suite.
