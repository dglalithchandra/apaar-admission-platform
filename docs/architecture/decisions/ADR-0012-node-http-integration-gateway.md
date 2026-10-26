# ADR-0012: Use one dependency-injected Node HTTP integration gateway

- Status: accepted for the Stage 5 local foundation
- Date: 26 October 2026

## Decision

Host versioned `/v1` transport in one strict TypeScript package using Node's HTTP server. Route handlers authenticate, authorize, validate transport inputs and delegate to existing application services or integration ports. They do not reproduce admission or casework policy. Responses use stable problem codes, correlation references, bounded JSON bodies, readiness checks and graceful start/stop.

## Consequences

The modular monolith keeps one transactional authority. Only three existing casework handoff routes are exercised in this foundation; completing every existing OpenAPI operation still requires explicit controller mapping before a production release.
