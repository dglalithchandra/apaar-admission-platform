# Product scope and users

## In simple words

An institution declares who it admitted. The platform checks that the institution and programme were approved for that academic year, that the seat belongs to the correct capacity bucket, that the student identity is valid or explicitly pending, and that the same person is not incorrectly enrolled elsewhere. Accepted records receive a stable reference. Problems become cases with an owner and a resolution path; they are not silently discarded.

## Primary users and their expectations

### Institution operator

Usually an admissions or compliance employee. They need to upload thousands of rows safely, see exactly which rows failed, correct only the failed rows, resume interrupted work, understand remaining capacity and obtain a defensible submission receipt.

### Institution approver

Usually a registrar, principal or authorised signatory. They need a final reconciliation, maker-checker approval, declarations, submission history and proof of what was submitted at a given time.

### AICTE reviewing officer

Needs accurate national and institution-level views, excess-intake alerts, identity and overlap cases, evidence, policy versions and a traceable decision history. They must be able to distinguish a late verification from a fraudulent record.

### AICTE policy administrator

Maintains academic years, approval imports, seat-category rules, validation severity and reporting definitions. Changes must be versioned and must not rewrite old decisions.

### Student

Needs to know whether the institution reported the admission correctly, whether APAAR linking succeeded, what information is visible, what consent or legal basis applies, and how to challenge an error.

### Employer or authorised verifier

Needs a narrow yes/no or status response for a stated purpose, with issuer, timestamp and revocation/current-status information. They should not receive the whole student record.

### Auditor and security operator

Need immutable event history, privileged-access reports, data exports, incident evidence and proof that policy and retention controls operated as designed.

## What AICTE expects to see

- approved intake versus accepted, pending and rejected admissions;
- normal, supernumerary, NRI, OCI and foreign-national capacity shown separately;
- institutions or programmes approaching or exceeding their permitted capacity;
- missing or unverified APAAR links and the reason for each exception;
- possible duplicate or overlapping enrolments with lifecycle status;
- submission completeness, late submissions and correction age;
- verifiable evidence behind every aggregate number;
- trends suitable for policy and accreditation without exposing unnecessary personal data.

## Product boundaries

The platform owns admission registration, capacity validation, conflict casework and verification evidence. It does not become a general college ERP, learning-management system, examination system or payment portal. It integrates with those systems through versioned contracts.

## Definition of success

The service is successful when an operator can complete the common journey without support, a reviewing officer can reproduce every decision, a student can discover and challenge errors, and a verifier obtains only the minimum authorised answer. A colourful dashboard alone is not success.
