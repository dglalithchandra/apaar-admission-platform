# ADR-0014: Fail closed at external provider boundaries

- Status: accepted; live providers blocked
- Date: 26 October 2026

## Decision

APAAR request encoding and response translation are injected only after an authority-approved contract is supplied. The HTTP adapter adds bounded timeout, retry, correlation and circuit protection and maps transient failures to unavailable or rate-limited states, never to an invalid learner. Approval imports require a canonical SHA-256 digest, effective dates, explicit authority and valid institution scope. Notifications are informational, outbox-driven, idempotent and independently retryable.

## Consequences

Simulators exercise failure behavior but provide no production assurance. Provider payloads, tokens and complete identifiers never enter logs or audit details.
