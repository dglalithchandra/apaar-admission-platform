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

## Stage 3 upload controls and unresolved policy

- Template 1.0 excludes names, dates of birth, Aadhaar numbers, addresses and contact details. Academic identities are accepted only as opaque verifier inputs; institutions cannot supply a provider outcome.
- Files are bounded before storage, hashed, passed through a replaceable scanning port and parsed with strict headers, UTF-8 decoding, row/field limits and formula-prefix rejection.
- Object storage and malware scanning are ports. The local in-memory storage and marker-based scanner are test simulators, not production controls.
- PostgreSQL retains the minimum row payload needed for resumable verification and admission submission. Production deployment must encrypt or tokenise academic-identity references and restrict decryption to the identity adapter.
- Batch audit/outbox details contain receipt, digest, version and product references, not raw row payloads.
- Retention periods for original objects, safe row values, identity references, findings, correction exports, attempts and audit records require AICTE legal, records-management and privacy approval. No deletion schedule is invented in Stage 3.
- Correction files remain sensitive operational records even without direct identity values. Authorisation, download audit, time-limited object links and approved retention are production requirements.

## Stage 4 casework controls

- Institution-scoped reads deliberately return not found for records outside the caller's scope, reducing identifier enumeration.
- Case commands require a declared purpose, reason, request reference, actor and correlation reference. Evidence APIs expose only scanned-object metadata; they do not return file bytes or raw identity payloads.
- Maker, reviewer and checker separation plus conflict declarations are enforced in both application workflows and database guards. Auditors are read-only in the application authorization model.
- Admission corrections, cancellations and transfers append versions; they never rewrite the original admission decision. Implementation receipts, reservation releases, audit events and outbox events are immutable and transactionally atomic.
- Cancellation and transfer capabilities default to blocked. Only an active `SOURCE_CONFIRMED` or `AUTHORITY_CONFIGURED` policy version can enable a capability, and activation requires independent maker and checker references.
- Case evidence, free text and exported audit views can still contain sensitive context. Production transport must add content scanning, field-level redaction, download authorization, retention enforcement and security monitoring before deployment.

## Stage 5 integration controls

- Synthetic authentication and provider simulation are rejected by production configuration. JWT authority is accepted only through an injected signature-verifying OIDC component.
- Gateway authorization denies by default and combines role with institution scope. Cross-institution institution-user access returns not found.
- JSON bodies, request rates and dependency calls are bounded. Correlation references are returned without logging bearer tokens or academic identifiers.
- External provider encoding/decoding is not implemented from guesses; an approved translator is required. Transient failures remain unavailable or rate-limited.
- Verification requires purpose plus consent or approved legal basis, discloses only requested supported claims, expires and can be revoked append-only.
- The local signing adapter is explicitly non-production. Production keys, issuer status and certificate profiles remain blocked.
