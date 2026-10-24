# External access and decision register

Everything below genuinely requires institutional authority, protected data or an accountable product decision. None should block the simulator-based first vertical slice.

| Need | Why public Browser access is insufficient | Work that can continue now | Required owner/input |
|---|---|---|---|
| API Setu/APAAR production subscription and credentials | The public catalogue shows the contract, but production authorisation is organisation- and use-case-specific. | Build contract tests, simulator and replaceable adapter against the public 1.1.0 spec. | Authorised organisation, API Setu/provider approval and secrets delivered through a secure channel. |
| AICTE approval master feed | Public lists do not provide the complete, signed/effective-dated internal record needed for regulatory decisions. | Define import contract and test with synthetic approval snapshots. | AICTE data owner: institution, campus, programme, category capacity, amendments and status feed. |
| Binding admission policy | Terms such as supernumerary, NRI/OCI/FN, cancellation and overlap require policy interpretation. | Implement versioned rule framework and examples labelled proposed. | AICTE legal/policy sign-off and effective dates. |
| Representative anonymised data | Public examples do not capture local ERP variations and real correction cases. | Generate edge-case synthetic fixtures and validators. | At least three institution types; privacy-reviewed, anonymised samples. |
| Official branding | Public logos are not automatic permission to imply an official service. | Use a neutral working identity and original design tokens. | Written brand approval and current asset/usage guide. |
| Languages and terminology | Translation quality and legal wording need accountable review. | Externalise all content and begin with English source strings. | Required language list and professional/legal reviewers. |
| Production deployment boundary | Data residency, NIC/MeghRaj/private DC, network routes and managed-service rules change architecture. | Keep infrastructure portable and document assumptions. | Hosting authority, security team, RTO/RPO, regions and network constraints. |
| Signing/HSM and credential issuer policy | A QR code is not a trusted credential; keys and issuer status must be authorised. | Define unsigned verification receipts and signing interface. | Issuer, certificate profile, HSM/KMS, rotation, revocation and disaster-recovery policy. |
| SSO/federation | Public code cannot identify the required government identity provider or assurance level. | Use local Keycloak realm and standards-based OIDC boundaries. | Identity provider metadata, assurance rules and test tenant. |
| Notification gateways | SMS/email sender IDs and templates require organisational ownership. | Use an outbox and local sink. | Approved gateway, sender identity, consent/legal basis and templates. |
| Scale and service levels | National peak windows and recovery objectives are not reliably inferable. | Run baseline tests with declared synthetic loads. | Institution count, batch maxima, deadline peak, verification rate, retention, RTO and RPO. |
| User validation | Public reviews reveal themes but cannot replace task observation with target operators. | Build test scripts and instrument task completion. | Institution operators, AICTE-style reviewers, students and verifiers authorised for research. |

## Inputs that must never be pasted into chat or committed

Real APAAR/Aadhaar values, names with dates of birth, mobile numbers, emails, production tokens, client secrets, private certificates, HSM material and unredacted institutional exports.
