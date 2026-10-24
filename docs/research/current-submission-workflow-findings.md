# Current AICTE data-submission workflow findings

Checked against the public AICTE student-enrolment and PGDM bulk-upload manuals and the currently reachable public pages on 24 October 2026. This describes the documented workflow, not every deployment or internal capability.

## What the two documented workflows do

### General student-enrolment workflow

The institution logs into the AICTE portal, opens Approval Process, selects Student Enrollment, chooses an academic-year application and enters enrolment against each approved course. It then presses **Submit Student Enrollment Data**. The manual states that the submit button becomes disabled after successful save and submission.

The documented workflow is therefore course-level enrolment reporting. The manual does not show an APAAR-linked student record, cross-institution duplicate check, student consent view, correction case or verifier journey.

### PGDM student-level workflow

The institution downloads a macro-enabled Excel template and instruction files, fills the fixed columns, presses an in-workbook **Validate** action and generates a CSV on the local `D:` drive. The user uploads that CSV to the portal, triggers **Import Excel**, downloads the resulting attachment, examines an `Error` column, corrects only failed rows in a new template and repeats the process.

The manual warns that re-uploading successful rows can create duplicate student records. If a record was added twice, the operator is instructed to mark the additional portal record `Is Duplicate Student = Y`. Other changes may be made manually in the portal.

The portal screenshots visibly expose fields such as Student ID, title, first/middle/last name, PGDM marks/CGPA and, in the spreadsheet tail, economic-backward status, student status, State, District, permanent address, PIN code, left-course status and course name. The complete authoritative column set is **not** legible or enumerated in the public manual; it must be obtained from the current portal/template owner rather than guessed.

## What works in the documented design

- one template supports bulk entry rather than forcing every PGDM student to be typed into the portal;
- local validation catches at least some missing or format-invalid values before upload;
- row-level errors can be returned to the institution;
- course identifiers link student rows to an approved course;
- failed rows can be corrected without intentionally replaying the entire batch;
- manually entered historic approved courses are possible when a course ID is unavailable.

## Product and operational weaknesses to avoid

| Current characteristic | User risk | Requirement for the replacement |
|---|---|---|
| Macro-enabled workbook and `D:`-drive-specific generation | Platform dependence, security warnings, fragile local setup and poor accessibility | Plain CSV/XLSX plus browser/API validation; no macro or fixed-drive dependency. |
| Fixed column/row structure that must not be changed | Small formatting mistakes can invalidate a submission | Versioned schemas, downloadable templates, tolerant parsing and explicit migration guidance. |
| Validation is split between the workbook and post-upload error file | Operators discover important failures late and repeat work | Preflight validation, server-side authoritative validation and identical rule codes in UI/API. |
| Successful rows must be manually excluded from retry | Replays can create duplicates | Idempotent batch and row keys; a safe “retry failed rows” action. |
| Duplicate handling is a human-applied flag after insertion | Duplicates may persist and statistics may already be wrong | Prevent exact duplicates; create review cases for probable identity/overlap matches. |
| Course can be entered with blank ID when missing | Free-text course identity can drift from the approval master | Controlled unresolved-course case; never silently count it against a guessed approval. |
| General enrolment appears as course totals | No individual identity or provenance for verification | Derive totals from accepted student-level records, reconciled against approval snapshots. |
| Final submission disables the documented button | Correction/reopening path is unclear | Explicit states, maker-checker submission, authorised reopening and immutable audit history. |
| Error result is an attachment the user must inspect | Hard to triage large batches and easy to lose context | In-browser error summary, filterable row issues, downloadable correction file and stable receipt. |

## Availability observations

- The manual's `aicte-india.org/bureaus/approval/PGDM_Bulk` page redirects to the current AICTE domain and returned **404 Not Found** during this check.
- The public AICTE facilities dashboard attempt ended in a connection reset.
- The public ONOD site returned **502 Bad Gateway** during this check.

These observations are availability evidence only. They are not used to score the authenticated production portal and should not be treated as proof that its normal functionality is defective.

## Inputs needed to complete the current-system mapping

- the latest official PGDM template and instruction workbook from an authorised institution account;
- a redacted successful import receipt and a redacted failed-row error file;
- the current general-enrolment screen's complete field definitions and reopening process;
- operator observation from at least three institution types;
- AICTE reviewer workflow, approval-master schema and duplicate-resolution procedure.

