# Pilot go/no-go checklist

Each item returns `PASS`, `FAIL` or `MANUAL_REVIEW`. The stored explanation and blocking flag are part of the immutable assessment.

| Check                          | Blocking for synthetic execution | Evidence                                            |
| ------------------------------ | -------------------------------- | --------------------------------------------------- |
| Configuration and membership   | Yes                              | Pinned pilot version; institution-campus validation |
| Approval-data freshness        | Yes                              | Effective snapshot age and import receipt           |
| Migration and reconciliation   | Yes                              | Dry run, explicit corrections and zero drift        |
| Policy blockers                | Yes                              | Accountable resolution or `MANUAL_REVIEW`           |
| Identity provider              | Yes                              | Simulator contract and outage behavior              |
| Authentication and roles       | Yes                              | OIDC claim/tenant checks                            |
| Security                       | Yes                              | Scan, container and access-control results          |
| Backup and recovery            | Yes                              | Latest restore drill                                |
| Incident ownership and support | Yes                              | Named synthetic owners and escalation path          |
| Accessibility and training     | Yes                              | Automated checks and task completion                |
| Observability and alerts       | Yes                              | Identifier-safe signals and stop alerts             |
| Rollback                       | Yes                              | Deployment and data rollback evidence               |
| Synthetic execution approval   | Yes                              | Explicit local dress-rehearsal approval             |
| Production authority           | No, only in `SYNTHETIC_ONLY`     | Remains `MANUAL_REVIEW`; blocks any real mode       |

Do not coerce missing evidence to pass. A current assessment must reference the exact execution version submitted for review.
