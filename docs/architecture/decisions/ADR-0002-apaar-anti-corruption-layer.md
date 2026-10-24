# ADR-0002: Isolate APAAR behind an anti-corruption layer

Status: accepted

## Decision

Our domain uses an `AcademicIdentityVerification` result. A dedicated adapter translates the current API Setu/APAAR contract into that result. A simulator implements the same internal interface.

## Why

The public API Setu catalogue currently presents APAAR collection version 1.1.0 with `VerifyApaar` and `verifyApaarIdByVendor` operations, but production use requires authorisation and the contract may change. External field names, tokens and error codes must not leak through our entire product.

## Required result states

`VERIFIED`, `NOT_FOUND`, `MISMATCH`, `TEMPORARILY_UNAVAILABLE`, `RATE_LIMITED`, `NOT_ELIGIBLE_FOR_APAAR`, `MANUAL_REVIEW` and `UNVERIFIED`.

No transient external failure may be converted into an invalid-student judgment.
