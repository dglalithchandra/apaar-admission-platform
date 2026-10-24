# ADR-0005: Use TypeScript for the application kernel

Status: accepted; supersedes the Spring Boot framework selection in ADR-0001

## Decision

Build the first production application kernel on Node.js with strict TypeScript. Preserve the modular-monolith boundary, PostgreSQL authority, transactional capacity protection and ports-and-adapters design already accepted. Select an HTTP framework only when the first exercised application service is implemented; the domain package must remain framework-independent.

## Why

The current delivery environment provides Node.js 24 and npm but no Java runtime. A single typed language across contracts, operational web applications and the domain kernel shortens the feedback loop without weakening the important architectural decisions. The admission rules are product-owned, deterministic code and do not depend on a particular web framework.

## Consequences

- application packages use strict TypeScript and publish declarations;
- the admission engine has no filesystem, network, clock or database side effects;
- PostgreSQL remains the planned authoritative store, but persistence is introduced only with migrations and transactional integration tests;
- external identity, approval, clock and audit concerns are expressed as ports;
- ADR-0001 continues to govern modularity and deployment shape, but not the Java/Spring choice;
- changing runtime again requires a new ADR and parity tests against the policy corpus.
