# ADR-0018: controlled pilot gates

## Status

Accepted for the synthetic Stage 7A foundation on 26 October 2026.

## Decision

Pilot configuration is versioned and append-only. Server-side capability evaluation returns enabled only for an `ACTIVE` pilot, an explicitly enabled capability and both kill switches off. Feature flags never bypass authorization, audit, capacity policy, validation or security controls.

Activation requires every readiness check to pass, an active effective window, an optimistic version match and a checker different from the maker. Pause retains accepted records. An incident or enabled kill switch fails closed. Expansion is permitted only after pause; it creates a new draft with no checker, so readiness and independent approval repeat. Exit requires zero reconciliation drift.

Legacy migration is synthetic and bounded. It validates schema versions, identifies duplicate keys, emits an explicit correction CSV, preserves an immutable receipt and allows rollback only before activation. Identity and regulatory values are never silently normalized.

## Consequences

Operators can stop exposure without rewriting admissions. Every change remains reconstructable from immutable configuration, readiness, migration, audit and outbox history. Production institution membership, policy authority, identity-provider contracts and rollout approval remain external prerequisites; local passing tests do not grant those authorities.
