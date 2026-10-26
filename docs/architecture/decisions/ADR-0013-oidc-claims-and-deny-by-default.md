# ADR-0013: Trust server-verified OIDC claims and deny by default

- Status: accepted; live identity provider blocked
- Date: 26 October 2026

## Decision

Authentication is a port returning a normalized principal. Production uses an injected signature-verifying OIDC/JWT component; the gateway never decodes an unsigned token as authority. Synthetic bearer tokens are allowed only in development and test and startup rejects them in production. Authorization combines role and institution scope, returns not found for cross-institution resource access and separates maker, reviewer, checker, auditor, verifier and service-client roles.

## Consequences

The production issuer, JWKS metadata, audiences, assurance rules and claims mapping remain blocked pending the approved SSO tenant.
