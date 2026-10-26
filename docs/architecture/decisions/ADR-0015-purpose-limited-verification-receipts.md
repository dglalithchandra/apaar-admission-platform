# ADR-0015: Issue minimal, expiring verification receipts behind a signing port

- Status: accepted; production signing blocked
- Date: 26 October 2026

## Decision

An authorized verifier must provide a purpose, requested claim set and consent or approved legal-basis reference. The service discloses only requested supported facts, creates a fifteen-minute immutable receipt and records signing algorithm and key identifier. Revocation is an append-only status record. The local signer is visibly synthetic and cannot be presented as an official credential.

## Consequences

Issuer policy, certificate profile, HSM/KMS, rotation and revocation infrastructure require accountable approval before production signing is enabled.
