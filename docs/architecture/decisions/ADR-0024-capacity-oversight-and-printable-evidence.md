# ADR-0024: Capacity oversight and printable evidence

Status: implemented locally; final regression gate in progress.

The oversight read model compares counters with reservations minus releases. It reports course-approval and institution-wide allocations, active admission records, historical review outcomes, review outcomes lacking approval, and retryable upload rows. Institution accounts are filtered on their authenticated institution and rejected if that scope is missing. Reviewer/checker/auditor roles can inspect cross-institution aggregates. No student keys are returned. Pages contain up to 100 allocations of each scope. CSV downloads are explicitly the current course-capacity page, not a complete national dataset. Review outcomes are not equivalent to open casework tasks; per-course student counts repeat across buckets and cannot be summed as distinct people.

Read queries use bounded filters, parameterized SQL and supporting indexes in migration 0013. Live aggregate queries can observe ongoing work; the report is not an immutable snapshot or a national throughput claim.

An authenticated HTML download renders an independent synthetic admission record with separate institution student ID, student reference and academic identity fields, plus current lifecycle state, original decision reference and generation time. Missing institution student IDs remain explicit because CSV template 1.0 does not collect that identifier. A standalone sample exercises a supplied synthetic institution ID. All variable text is HTML-escaped and the document contains no scripts or external assets. Printing supports a downstream issuer layout; it does not issue a degree or assert government authority.
