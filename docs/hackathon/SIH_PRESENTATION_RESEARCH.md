# SIH presentation research and winning-deck strategy

## Purpose

This note turns the SIH six-slide format, publicly shared shortlisted decks and the repository's tested evidence into a presentation strategy for Problem Statement 26263. It does not claim that every publicly shared deck won a national finale; each example is labelled according to the source that shared it.

## What the prescribed format actually rewards

The SIH 2026 template contains seven source slides: six submission slides plus an instruction slide that explicitly says to delete it before upload. The submitted idea deck is therefore limited to six slides including the title. The required story is:

1. title and problem identity;
2. proposed solution, problem fit and innovation;
3. technical approach, methodology and working prototype;
4. feasibility, viability, risks and mitigation;
5. impact and benefits;
6. research and references.

The published SIH selection criteria include novelty, complexity, clarity, feasibility, practicability, sustainability, scale of impact, user experience and potential for future progression. The deck must therefore make those criteria easy to score, not merely look impressive.

## Decks inspected

The comparison used a public copy of the current SIH 2026 editable template, the earlier 2025 format and the following publicly shared examples:

- **Sourya / Team Teravax** - shared as selected. Its strongest move is a labelled system visual followed by a current-versus-proposed impact chain. It proves the whole idea at a glance, but the three-page public copy does not cover every prescribed section.
- **Trinetra** - shared as selected. It follows all six headings and includes a working link, comparison matrix and research references. Its weakness is feature and technology density: several claims are hard to verify from the slide itself.
- **Resemblers** - shared as shortlisted. It maps risks directly to mitigations and shows a complete data flow. Its weakness is tiny text and a solution slide that reads like a requirements document.
- **Digi Sanchalan** - shared as waitlisted. It is visually energetic and evidence-rich, but its architecture and impact slides contain too many elements to understand in a few seconds.
- **Krishi Dhan Kavach** - shared as waitlisted. It communicates a strong current-versus-future pipeline, but the slides are too dense for projection and mix proposed capability with demonstrated capability.

The main lesson is not to copy the visual style of any one deck. Strong entries make the problem, mechanism and impact visible. We should add something most examples lack: a clean separation between **working evidence**, **simulated authority boundaries** and **future authorised integration**.

## What our deck should do differently

### 1. Use one memorable thesis

> Protect every legitimate seat before admission becomes an audit problem.

Every slide should reinforce this thesis. The product is not another data-entry portal; it is a policy-aware admission integrity system that prevents over-enrolment, preserves evidence and lets regulators test policy changes safely.

### 2. Lead with the system's hardest working proof

The strongest evidence already implemented is:

- transactional last-seat protection against concurrent admissions;
- category-specific capacity accounting, including NRI, TFW, FN/OCI/Gulf-worker, lateral entry and PM-USPY paths;
- versioned batch ingestion with correction and retry;
- governed institution-reviewer-checker casework;
- seven-role, deny-by-default access boundaries;
- immutable audit and outbox records;
- a PostgreSQL-backed integrated reference deployment;
- an Admission Policy Digital Twin that replays an 84-record synthetic cohort without writing to the live ledger;
- automated unit, component, PostgreSQL, browser, container, recovery, security, accessibility and full-system checks.

### 3. Replace feature lists with a proof ladder

Each claimed capability should be tagged mentally as one of:

- **Working now** - executable in the judge environment;
- **Simulated safely** - authority-owned service is represented by a replaceable adapter and synthetic data;
- **Requires authority** - credentials, legal approval, official branding, real student data or national production decisions.

This is a competitive strength because it shows engineering maturity and avoids pretending that a student team has government production access.

### 4. Make the hero feature consequential

The Admission Policy Digital Twin should be the centrepiece. Its message is not “we used AI.” Its message is:

> Before changing an admission rule, AICTE can replay the exact deterministic policy engine against a synthetic or approved historical cohort, see who gains access, detect new excess-admission risk and inspect every changed decision.

That gives the jury a policy-level outcome, a human-impact view and a technically credible differentiator in one screen.

### 5. Make the deck readable from the back of a room

- One argument per slide.
- One dominant visual per slide.
- No paragraph smaller than approximately 20 pt in the editable deck.
- At most three proof metrics on a slide.
- Use product screenshots, diagrams and native charts instead of logo clouds.
- Use a small footer for source/evidence references rather than putting full URLs in body copy.
- Include a QR code only where it leads to a stable judge guide, repository or short walkthrough.

## Recommended six-slide story

### Slide 1 - Title

**Admission Registry**
**APAAR-linked, policy-aware admission integrity for AICTE**

Required PS metadata remains visible. Use one quiet product image rather than a decorative technology collage. Team name and team ID remain the only user-supplied fields.

### Slide 2 - Idea title / proposed solution

Headline: **From annual totals to a verifiable admission ledger**

Show a before-and-after flow:

`Institution files and totals -> late/manual reconciliation -> limited student-level traceability`

becomes

`Versioned upload -> APAAR adapter -> policy decision -> protected seat -> immutable receipt -> regulator view`

Three differentiators only:

1. prevents excess admission at the last available seat;
2. explains every decision with a stable rule code;
3. tests proposed policy safely through the Digital Twin.

### Slide 3 - Technical approach / working prototype

Headline: **One policy engine, one transaction, one defensible record**

Use a left-to-right architecture with a real portal screenshot and five layers:

`Institution/AICTE roles -> authenticated gateway -> admission, batch and casework modules -> PostgreSQL transaction + audit/outbox -> replaceable authority adapters`

Add three evidence badges only: real PostgreSQL concurrency test, full-system restart persistence, and seven-role access testing. The live walkthrough link/QR belongs here.

### Slide 4 - Feasibility and viability

Headline: **Production-shaped locally; authority integration is explicit**

Use a two-column readiness boundary:

- **Built and testable now:** policy kernel, migrations, batch workflow, casework, audit/outbox, adapters, container deployment, recovery and security harnesses.
- **Authority-controlled next:** real APAAR/API Setu access, AICTE SSO/feed, production hosting and keys, legal/privacy approval, official signing and representative pilot cohort.

Map the four largest risks to controls: policy ambiguity -> manual review; provider outage -> retry/outage state; duplicate/concurrent admission -> idempotency + serializable locking; privacy leakage -> minimisation + consent/legal-basis + scoped roles + audit.

### Slide 5 - Impact and benefits

Headline: **Prevent harm today; improve policy before tomorrow**

Use the Digital Twin's baseline-versus-proposal chart as the dominant visual and show benefits by stakeholder:

- students: fewer duplicate/conflicting records and explainable outcomes;
- institutions: one upload, row-level correction and defensible receipts;
- AICTE: real-time intake integrity, anomaly triage and policy simulation;
- authorised verifiers: purpose-limited, auditable verification.

Do not invent national savings or adoption numbers. Use only measured prototype evidence and label scenario outputs as synthetic.

### Slide 6 - Research and references

Headline: **Rules from authoritative sources; proof from executable evidence**

Use four compact source groups:

1. AICTE Approval Process Handbook 2024-2027;
2. official APAAR About, Privacy and Terms pages;
3. API Setu ABC/APAAR catalogue and SOP;
4. repository evidence: tests, ADRs, threat model, SBOM and judge guide.

Add a small competitor-gap matrix only if it remains readable. End with QR codes for the repository/judge guide and walkthrough after those stable URLs exist.

## Presentation narrative for the speaker

The spoken story should follow five questions:

1. **What fails today?** AICTE cannot continuously reconcile every admission against approval capacity and a national academic identity.
2. **What is the dangerous moment?** The final seat, where duplicates, categories and simultaneous submissions can silently create excess enrolment.
3. **What did we build?** A policy-aware ledger that verifies, decides, reserves, explains and records the outcome atomically.
4. **Why should the jury trust it?** It runs as a connected PostgreSQL-backed system, handles outages and concurrency, and keeps external authority boundaries honest.
5. **What becomes possible next?** AICTE can test policy consequences before rollout and conduct a supervised pilot once official access is granted.

## Anti-patterns to avoid

- “AI + blockchain + cloud” without a demonstrated mechanism.
- Fake national-scale performance claims from local synthetic tests.
- Calling a mock external response an official APAAR verification.
- Screens full of tiny architecture boxes.
- Repeating the problem statement verbatim instead of showing the failure chain.
- Adding more features to appear innovative when the existing evidence is stronger.
- Using an unverified survey statistic or stock market-size number.
- Replacing the prescribed SIH slide headings with a generic startup pitch deck.

## Remaining inputs before the final deck can be submission-ready

- registered team name;
- SIH team ID;
- team/institution details if the current year's template requires them;
- final GitHub URL and walkthrough-video URL for QR codes;
- the exact current-year SIH editable template if it differs from the inspected 2025 six-slide format.

## Public research links

- SIH selection criteria: https://sih.gov.in/letters/Guidelines-College-SPOC.pdf
- Public SIH deck collection used for comparison: https://github.com/Sanidhya46/Sih-selected-ppts
- Public copy of the current SIH 2026 editable template: https://github.com/ashebbar-dev/SIH/blob/main/resources/SIH2026-IDEA-Presentation-Format.pptx
- Public 2025 template copy and internal-round decks: https://github.com/Programmers-Paradise/sih-internal-25/tree/main/PPT
- SIH 2024 winner walkthrough: https://www.youtube.com/watch?v=NOSeLiybJSE
- AICTE Approval Process Handbook 2024-2027: https://aicte-qa.aicte-india.org/sites/default/files/APH%20Final.pdf
- APAAR About: https://apaar.education.gov.in/about
- APAAR Privacy: https://apaar.education.gov.in/privacy-policy
- APAAR Terms: https://apaar.education.gov.in/termsofuse
- API Setu ABC/APAAR catalogue: https://directory.apisetu.gov.in/api-collection/abc
- API Setu consumer SOP: https://apisetu.gov.in/sop
