# ADR-0025: Finding-specific resolution guidance and portable snapshot integrity

Status: accepted, 29 October 2026.

## Decision

Add two small extensions to the existing institution portal. Resolution guidance accompanies recorded batch findings and admission decisions. A portable evidence export accompanies the authorized admission detail view. Neither extension changes policy, authority, database transactions or case implementation.

The planner maps recorded findings to an actor, supported route and required evidence. Missing fields can be corrected and resubmitted. Provider outages require recovery and supported retry. Capacity, identity conflicts, category evidence and unknown rules require accountable review. All findings remain visible. Guidance does not clear a finding, optimize a repair, recompute a historical decision or promise acceptance. Subsequent requests must pass existing current server validation. This is a deterministic guidance catalogue, not the proposed full constraint-solving Resolution Planner.

The evidence bundle preserves the returned stored snapshot as named sections. UTF-8 canonical JSON sorts object keys using JavaScript string order, preserves arrays and rejects non-finite/non-JSON values. SHA-256 leaves hash `leaf:` followed by canonical `{name,value}`. Sorted section names define tree order. Each parent hashes `node:<left hex>:<right hex>`; an odd node is promoted unchanged. The final root hashes `niyamsetu-evidence/1:<section count>:<tree hex>`. The root therefore binds format, section count, names and values. Changes to values, section names, order, checksums or structure fail verification against an independently retained root.

The Node24 verifier imports the same algorithm directly with native type stripping and requires an independently retained expected root. This prevents the misleading practice of treating a freshly recomputed self-checksum as proof. A user controlling both the export and the expected root can replace both. There is no claimed issuer authentication, trusted timestamp, public anchoring, append-only transparency log, database completeness proof or real-world deadline proof. The export may contain record data and is not a privacy-preserving public credential. No root or student evidence is published automatically.

## Alternatives not selected

Do not introduce OTP/DigiLocker attestation without authorized identity/session integration. Do not split NRI into extra intake. Do not infer fraud from names, midnight uploads or shared family contact details. Institution risk scores need representative validated data and a defensible decision process. Existing signing, scoped grants, validation and uploads are reused rather than relabelled as new inventions. Official integrations, provisional admission authority, biometrics and regulatory exemptions remain outside this change.

## Consequences

The product provides useful next steps and independently checkable snapshot changes with no extra dependencies or migrations. This is a bounded implementation of adoption guidance and part of the proposed tamper-evidence feature. It cannot support claims of a 93+ novelty score or universal uniqueness. Supporting a real transparency timeline would require atomic event commitments, consistency/inclusion proofs and external root anchoring with independent time evidence.
