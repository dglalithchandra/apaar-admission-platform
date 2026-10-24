# Privacy and threat baseline

## Data minimisation

- Use an internal opaque student key; store APAAR encrypted and display only a masked form unless the task requires it.
- Do not collect Aadhaar unless a binding requirement and lawful design review explicitly require it.
- Verifiers receive the minimum fact for a declared purpose, not a student profile.
- Separate contact data, identity attributes, academic records, evidence and audit data by access purpose.
- Make retention and deletion/archival rules explicit per record class.

## Initial threats and controls

| Threat | Required control |
|---|---|
| Stolen institution account uploads false students | Phishing-resistant MFA where supported, maker-checker, device/session risk, batch receipt and anomaly review. |
| CSV formula or parser injection | Strict parser, content-type and magic checks, formula neutralisation on exports, size/row limits and sandboxed malware scan. |
| Exhausting the final approved seat concurrently | Database constraint/lock and transactional capacity reservation. |
| Replay of a successful upload | Institution-scoped idempotency key and content hash. |
| Enumeration through verification endpoint | Authorised clients, purpose binding, rate limits, non-enumerating responses and audit. |
| Privileged bulk export | Just-in-time role, approval, watermarking, row limits, reason, alert and immutable audit. |
| APAAR/API outage incorrectly rejects admission | Circuit breaker and explicit `TEMPORARILY_UNAVAILABLE`/pending state. |
| Malicious or mistaken duplicate score | Explainable signals, thresholds, no autonomous adverse decision and review/appeal. |
| Audit log alteration | Append-only event stream, restricted writer, integrity chaining/checkpoints and external retention. |
| Signing-key theft | HSM/KMS, least privilege, rotation, revocation and offline recovery ceremony. |

## Logging rule

Logs contain request and record references, not full identifiers or uploaded row contents. Security telemetry access is itself audited.
