# Current submission evidence

Updated 30 October 2026. Application code through `8ded9e3` was exercised again during the final documentation/media pass; that pass changed no runtime code, contracts, migrations, dependencies or fixture behavior.

The repository's current tracked six-slide presentation is `ASTRAL_NiyamSetu_SIH_2026_Reconciled.pptx`. Its chart is reproduced from the default inputs in Policy Lab and independent expected-value tests, not from a national impact estimate. Team-specific exports prepared outside the repository must be checked against the policy numbers and claims in this file before submission.

The current product verification is newer than the deck's original evidence snapshot. `npm run check` passed 347 unit/component tests plus formatting, lint, builds, type checking, coverage and contract/schema validation. Fresh PostgreSQL suites passed 17 admission-application, 11 batch, 21 casework and 25 gateway integration tests. The connected Compose full-system journey also passed, including all seven roles, restart persistence, duplicate rejection, cancellation/readmission, reconciliation, printable record and public-key verification after restart. `npm audit --audit-level=high` reported zero vulnerabilities.

Source: AICTE Approval Process Handbook 2024–27, PDF pages 34–35, 70–71, 75–76. Baseline intake/NRI/TFW: 60/3/3. Proposed configuration: 80/4/4. Fixed synthetic cohort: 84 records; zero occupied seats. Baseline outcome: 65 accepted, 17 rejected, two review. Proposal outcome: 73 accepted, nine rejected, two review. Meeting handbook ceilings does not authorize a proposed institutional configuration.

The current video is `ASTRAL_NiyamSetu_Current_Walkthrough.mp4` (2:20, 1920×1080, 30 fps). It is an edited sequence of captures taken from the running application, with a composited moving pointer highlight and captions; it is not a continuous live screen recording or a voice recording. It is paired with `ASTRAL_NiyamSetu_Current_Video_Script.md` and `ASTRAL_NiyamSetu_Current_Walkthrough.srt`. It shows the reconciled 60/3/3 baseline, explicitly unapproved proposal, stored decision evidence, role denial and a locally signed receipt. A permanent banner states that the environment is synthetic and no official services are connected.

Earlier WebM recordings are historical revisions. Preserve them, but do not use their old policy numbers, branding or claims as current evidence.

New captures: `assets/policy-source-reconciled.jpg` and `assets/policy-outcomes-reconciled.jpg`. Both show the running local application with synthetic data. No external category verification or official APAAR connection is implied. The original source files and Git history have been preserved.
