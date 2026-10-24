# APAAR public contract findings

Source: the public API Setu file `apisetu_abc_Verify-APAAR-ID-v1_1.1.0.yaml`, downloaded and hashed on 24 October 2026. This is a technical reading, not confirmation that AICTE is authorised to use either operation for the proposed purpose.

## Confirmed from the public contract

- OpenAPI 3.0.0, API version 1.1.0, marked updated 15 December 2025.
- Production base URL is `https://apisetu.gov.in`.
- Authentication declares `X-APISETU-CLIENTID` and `X-APISETU-APIKEY` headers.
- `POST /moe/abc/srv/v1/VerifyApaar` verifies student details against APAAR and documents encrypted data, a signature and a consumer public key.
- `POST /moe/abc/srv/v1/verifyApaarIdByVendor` is described for authorised concession partners and documents an encrypted request.
- The documented plain fields include APAAR, name, date/year of birth, gender, transaction ID and a consent-provider artefact.
- The vendor operation documents 12 numeric digits, gender values `M/F/T`, consent-provider details and multiple provider authentication modes.
- The examples distinguish missing input, invalid client/token, decryption failure, identity not found and demographic mismatch.

## Important integration risks

1. The two operations have different response shapes and birth-date fields. They need separate provider clients behind one internal result model.
2. At least one message code appears in more than one context. Mapping must use operation, HTTP status and response shape—not message code alone.
3. The public spec places most request definitions in prose/examples rather than complete schemas. Generate no production client until provider confirmation and contract tests exist.
4. The documented encryption example uses AES-256-ECB. We must not improvise cryptography; obtain the provider's exact current algorithm, padding, encoding, signing and key-rotation specification and security approval.
5. The vendor endpoint is described for student concessions. Its age-related response and consent rules must not be copied into general AICTE admission policy without provider and legal confirmation.
6. Some successful responses expose more academic information than admission verification needs. The adapter must discard unnecessary fields and logs must never contain raw requests or identifiers.
7. A 404 can represent absence or authentication/mismatch conditions in examples. The product must preserve a safe distinction between `NOT_FOUND`, `MISMATCH` and provider/authentication failure.

## Questions for provider onboarding

- Which operation and purpose is approved for AICTE admission registration?
- Is the public 1.1.0 contract current for sandbox and production?
- What are token issuance, rate limits, IP/mTLS requirements, timeout and retry rules?
- What are the exact encryption, signing, canonicalisation, padding and key-rotation requirements?
- Which attributes may be stored, for how long, under what legal basis and with what masking?
- How are minors, adults over the documented age condition, OCI and foreign-national exceptions handled?
- Is consent required for this regulatory purpose, and what notice/withdrawal/evidence semantics apply?
- Are there webhooks, bulk verification or asynchronous status operations?
- What test personas and deterministic sandbox errors are available?
- What is the incident, revocation and contract-change notification process?
