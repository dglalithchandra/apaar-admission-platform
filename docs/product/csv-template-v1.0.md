# Student admission CSV template 1.0

This is a product-owned contract for the Admission Registry. It is not an official AICTE, APAAR or API Setu format.

## Limits and encoding

- UTF-8 CSV, optionally with a UTF-8 byte-order mark.
- Media type `text/csv`; filename must end in `.csv`.
- Maximum 5,242,880 bytes and 10,000 data rows.
- One header row followed by at least one data row.
- RFC-style quoted fields are accepted by the pinned parser. Malformed quoting and column counts fail the entire file.
- Headers must match exactly. Missing, duplicated and unknown headers fail the entire file.
- All fields are limited to 256 characters. Values beginning with `=`, `+`, `-`, `@`, tab or carriage return are rejected to prevent spreadsheet-formula injection.

## Columns

| Column | Meaning |
| --- | --- |
| `template_version` | Must be `1.0` for every row. |
| `record_key` | Institution-controlled stable row key, unique inside the file. |
| `student_reference` | Opaque institution reference; do not provide a name, Aadhaar number or contact detail. |
| `academic_identity_reference` | Opaque value passed to the configured identity verifier. It is not a verification outcome. |
| `institution_id`, `campus_id`, `programme_id`, `course_id` | Product identifiers matching the effective approval snapshot. |
| `academic_year` | `YYYY-YY`, for example `2026-27`. |
| `admission_date` | ISO date `YYYY-MM-DD`. |
| `category` | `ORDINARY`, `NRI`, `FOREIGN_NATIONAL`, `OCI`, `GULF_WORKER_CHILD`, `LATERAL_ENTRY`, `TFW`, `PM_USPY` or `OTHER_SUPERNUMERARY`. |
| `lateral_capacity_source` | Empty except for lateral admission; then one documented lateral bucket. |
| `nri`, `oci`, `foreign_national`, `gulf_worker_child` | Lowercase `true` or `false`. |
| `eligibility_evidence` | `VERIFIED`, `PENDING` or `MISSING`; the Stage 2 policy decides the consequence. |

No names, dates of birth, Aadhaar numbers, addresses, emails or phone numbers belong in the template. The service performs only unambiguous structural conversion; it never silently repairs values.

## Versioning and corrections

Breaking column or semantic changes require a new template version. Published versions remain explicit; uploads declare their version and receipts retain it immutably. Version 1.0 rejects unknown columns so typographical errors cannot disappear silently.

The correction export contains only retained safe fields plus machine codes and explanations for rows requiring action. Every cell is quoted, quotes are escaped and formula prefixes are neutralised with a leading apostrophe. An institution must correct its source system and submit a new idempotent batch; the export is not an authority to mutate a terminal admission.
