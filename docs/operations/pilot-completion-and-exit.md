# Pilot completion and exit

Completion requires drained workers, stopped new submissions, balanced source/accepted/rejected/pending/casework totals, valid capacity counters and consistent audit/outbox events. Unresolved incidents produce `REMEDIATE`; remaining operational work produces `EXTEND_PILOT`; clean technical evidence may produce `EXPAND_READY`.

Any unresolved authority-controlled decision produces `AUTHORITY_REVIEW_REQUIRED`. `TERMINATE` is available as a technical classification, but software never makes the accountable rollout decision. The completion execution version, audit, outbox and report are atomic and immutable.
