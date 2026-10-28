# ADR-0023: Scoped verification grants and independent local issuer

Status: implemented locally; final regression gate in progress.

Verification now resolves a registered consent/legal-basis grant instead of accepting an arbitrary reference. Exactly one basis is required. The grant must match the record/institution, recipient organisation, purpose and requested fields; it must be currently valid and not withdrawn. Consent is record-scoped. A configured legal basis can be institution-scoped. Receipt validity cannot exceed the grant expiry. Replays re-check authorization before returning a previous receipt.

Grants and withdrawals are immutable. PostgreSQL row locks serialize receipt insertion with withdrawal. Withdrawal appends revocations for existing receipts in the same transaction; subsequent inserts fail closed. A grant revoked during issuance is translated to a 403 denial. Migrations 0011, 0012 and 0014 implement the storage, atomicity and expiry bound without changing applied migration checksums.

The reference gateway uses Ed25519, with a private key created by npm run local:keys under ignored private-inputs/local-signing. Only the gateway receives the read-only key mount. Workers receive a disabled signer. The public key is available to authorised verifiers/auditors at GET /v1/verification-key, and full-system verification uses that public key after restart. Keep the local key with its database; replacing it changes issuer identity. This is not a production rotation/KMS/HSM design or an official credential issuer. Earlier synthetic hash receipts are not silently promoted to Ed25519 receipts.

The local seed records explicitly identified synthetic legal-basis grants. This is a controlled fixture, not proof of statutory authority or real student consent. Trusted student authentication, actual consent evidence acquisition and governed legal-basis configuration remain integration responsibilities. No new public endpoint allows a requester to self-declare a grant.

Security tests cover unknown/blank/ambiguous references, wrong recipient/purpose/subject/institution, disallowed fields, future/expired/withdrawn grants, concurrent withdrawal/issuance, malformed persistence errors, tampering and wrong keys. This evidence does not replace security review or penetration testing.
