# API Setu and APAAR onboarding plan

## Current public process

The official February 2024 consumer SOP and August 2026 user manual establish a multi-stage process:

1. Register the organisation through the API Setu Partners portal using DigiLocker/MeriPehchaan credentials.
2. Obtain API Setu consumer approval by selecting the service category and submitting a use case of at least 250 characters. Up to 10 supporting files may be attached, each up to 5 MB.
3. Search the API Directory and select the required APAAR operation.
4. Upload a mandatory API Permission/Authorisation Letter obtained from the API publisher.
5. Submit the subscription for publisher approval.
6. After approval, generate a Client ID/API key pair. Restrict the key by API, IP and domain. The API key is shown only once.

The older consumer SOP additionally asks for proof of identity, an organisation authority letter, organisation PAN, GST registration certificate, certificate of incorporation, a domain-registered email and only one request per organisation.

## Product-specific position

The organisation should request consumer access only. The project has no need to publish an API to the public marketplace at this stage. The browser session currently reaches the official signup page, which delegates sign-up to DigiLocker/MeriPehchaan.

## Prepared locally

The ignored `private-inputs/onboarding/apisetu/` directory contains:

- organisation profile worksheet;
- exact onboarding checklist;
- portal-ready use-case draft exceeding 250 characters;
- organisation authority-letter template;
- draft request for the publisher authorisation letter.

These drafts must not be submitted under an individual's name unless that individual is formally authorised by the organisation.

## Remaining human gates

- identify the legal API-consuming organisation and check whether it already has an API Setu account;
- provide the authorised representative and domain email;
- obtain organisation documents and signatory approval;
- log in through DigiLocker/MeriPehchaan;
- approve the final use-case statement and external documents;
- request the publisher's authorisation letter;
- confirm production IP/domain before restricted key creation;
- place the one-time key directly into an approved secrets manager.

## Implemented local adapter boundary

The Stage 5 adapter now enforces HTTPS, correlation, timeout, bounded retry and circuit protection. Request encoding and response decoding are injected and intentionally absent until the approved provider contract is supplied. The deterministic simulator covers verified, not-found, mismatch, unavailable, rate-limited, not-eligible, manual-review and unverified states. It is not evidence of API Setu connectivity.
