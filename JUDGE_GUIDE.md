# NiyamSetu — judge guide

Independent admission registry for SIH problem 26263. The running product uses fictional SYNTH-prefixed records. Official APAAR, AICTE SSO and external approval services are not connected. Independent local Ed25519 signatures prove the local issuer signed a receipt; they do not establish government verification.

## Start from a clone

Install Git, Node.js 24+ and npm 11+, and start Docker Desktop's Linux engine. Clone the existing GitHub repository and open a terminal in its root. Run:

```powershell
npm run judge:start
```

This prepares an ignored local signing key and builds/starts PostgreSQL, the gateway, portal and durable workers. Container builds run `npm ci`; a host dependency install is not needed just to launch. For host tests, run `npm ci` first. First startup needs network access to retrieve pinned images/packages. Wait for Compose to report healthy, then open <http://127.0.0.1:5173/>.

If that port serves another application, use an unused port without stopping the other application:

```powershell
$env:NIYAMSETU_PORT = '5175'
npm run judge:start
```

Then open <http://127.0.0.1:5175/>. Keep this variable set for later starts. Stop with `npm run judge:stop`; data remain in the project's named PostgreSQL volume. Restart with `npm run judge:start`. Keep `private-inputs/local-signing/` with that database so old signatures remain verifiable. Never upload this folder to GitHub.

## A reproducible first journey

1. Choose **Institution operator** in the local Preview role control. This is a local synthetic role explorer, not production login.
2. In **Batch upload**, select `contracts/fixtures/synthetic/judge-practice.csv` from the clone and choose **Upload and validate**. With fresh fixtures and available ordinary capacity, expect one accepted ordinary admission, one invalid row missing its student reference, and one TFW row requiring category-evidence review. CSV VERIFIED is only a declaration.
3. Read the row findings and receipt. Export corrections to retain diagnostics. Upload `judge-practice-corrected.csv`: it contains only the corrected second row with the original academic identity. Expect that ordinary row to be accepted if capacity remains. This creates a new batch; the original receipt is preserved. To correct your own file, use the original template columns, fill the missing field and remove exported diagnostic columns before re-uploading. Do not resubmit accepted rows unnecessarily.
4. Open **Admissions**. Search `SYNTH-JUDGE-STUDENT`, select **View decision**, and inspect the actual findings, source approval, ruleset, identity check, reservations and governed history. Results are paged, 25 records at a time. The screen shows original decisions rather than silently reevaluating old records under new rules.
5. For a registered ordinary admission choose **Create governed request**. Its reference is filled in. Enter a synthetic reason, create the draft, then **Submit for review**. Creating/submitting a request does not alter admission capacity.
6. Switch to **AICTE reviewer**, open **Casework**, find that request and **Start review**. Declare no conflict before making a reasoned recommendation. Switch to **AICTE checker** for an independent decision. Consult the displayed available actions: approval and implementation are distinct, and unsupported remedies must not be inferred. The immutable case history records each action.
7. As **Authorized verifier**, open **Integration assurance** and issue the synthetic verification receipt. This example is intentionally scoped to the seeded registration and stored grant shown on screen, not every admission in the registry. Read recipient, purpose, claims, expiry and local issuer. **Refresh receipt status** reads the service again. Unsupported diagnostic preview buttons are disabled in the connected application.
8. As **AICTE reviewer**, open **Policy Lab**. The source-aligned baseline is intake 60/NRI 3/TFW 3; the example proposal is 80/4/4. Open recorded inputs and explanations. Changing to 60/5/6 blocks the configuration. Hypothetical amendments are visibly NOT AUTHORIZED and cannot activate live capacity.

Repeated upload of the identical file returns its original batch. Reusing an academic identity with fresh request/student keys must not reserve a second seat. Existing state can therefore change outcomes: a record already admitted may be rejected as a duplicate, and exhausted capacity blocks acceptance. Do not erase the shared local database merely to make a result look successful. For another independent practice cohort, change the SYNTH suffix consistently in record, student and academic-identity fields; keep institution/course identifiers unchanged.

## Resolution guidance and snapshot integrity

In Batch upload row findings and Admissions decision detail, expand **Resolution planner**. Each finding retains its original code and explanation, with a responsible actor, suggested route and required evidence. A missing field can be corrected in the original CSV template. Capacity and evidence constraints remain pending accountable review. Guidance does not implement a change or promise that resubmission will pass. It is not a minimum-cost repair solver.

In Admissions, use **Download evidence bundle** to export the returned stored snapshot. Save the displayed 64-character root separately, for example in a private evaluation note. Verify offline from the repository with Node24:

```powershell
node scripts/verify-evidence.mjs '<path-to-bundle.json>' '<independently-retained-root>'
```

An unchanged file returns MATCH with exit0. Editing a finding, approval or history value returns MISMATCH with exit1. Changing the file and its internal root still fails against the original retained root. Missing command arguments return exit2. Keep this file private: it contains record evidence, not just an employer's limited claims. This checksum proves correspondence to your retained snapshot only. It does not prove official issuer identity, database completeness, trusted event time or admission before a deadline. The product does not publish roots or student evidence.

## Verification boundaries

Receipt creation requires an active stored grant matching recipient, purpose, institution/admission and allowed claims. Expired or withdrawn grants prevent new issuance. Receipt revocation is a separate service-authorized operation; this UI does not create/withdraw grants or provide an unrestricted revoke button. Existing PostgreSQL tests cover grant withdrawal and atomic issuance boundaries. The current browser example uses an explicitly fictional legal-basis grant, not real consent or statutory authority. A signed receipt cannot prove the original institution assertion was true.

## Local security and hosting

Compose publishes application/database ports on loopback. Do not expose this reference profile via a tunnel or public host: `/v1/reference-sessions/:role` supplies local synthetic tokens, and the role explorer is not an authentication system. There is no verified safe public deployment in this release. Hosting requires real application sessions, server-side role/tenant membership and isolated evaluator data; those are intentionally outside this package. Docker remains the supported local launch path; no new native launcher is claimed.

## Verification commands

```powershell
npm ci
npm run check
npm run test:integration:postgres
npm run test:e2e:batch
npm run test:e2e:casework
npm run test:e2e:gateway
# If using the alternate local port:
$env:NIYAMSETU_PORT = '5175'
$env:FULL_SYSTEM_BASE_URL = 'http://127.0.0.1:5175'
npm run test:full-system
```

The full-system suite exercises real persistence, the new admission search/evidence, verifier and tenant denial, conflict-declaration reads, governed cancellation, duplicate protection, reconciliation and restart/signature verification. Pilot subsets are included in the gateway suite; do not count them again.

## Submission assets and troubleshooting

Use `docs/hackathon/CURRENT_EVIDENCE.md` to select current artifacts. The current recording is `docs/hackathon/ASTRAL_NiyamSetu_Current_Walkthrough.mp4`, paired with `ASTRAL_NiyamSetu_Current_Video_Script.md`. Older WebM recordings predate the reconciled product and are superseded. No participant study results or national-scale performance are claimed.

If a page is stale, reload after Compose is healthy. If it displays another product, use the alternate port above. If the gateway is unavailable, wait for Docker health and retry; no browser action should be described as committed without a returned receipt. Do not remove persistent volumes unless you intentionally want to erase all local synthetic journeys. Admission lists/evidence and request histories require the connected gateway; isolated component previews do not invent them.
