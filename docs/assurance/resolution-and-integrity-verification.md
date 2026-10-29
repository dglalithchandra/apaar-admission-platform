# Resolution guidance and snapshot integrity verification

29 October 2026. This change adds finding-specific guidance in batch results and admission detail, plus a portable evidence bundle and independent Node24 verifier. Policy, authentication, persistence and transaction services are unchanged. See ADR-0025.

## Scope and results

- Root `npm run check` passed: formatting, lint, build, type checking, coverage and contracts. 347 unit/component tests passed: portal89, application25, casework56, domain61, batch36, gateway76, twin4. Portal configured coverage thresholds passed; domain coverage remains100%. These are package-scoped results, not whole-system100% coverage.
- The 23 added tests cover guidance with interacting findings, provider recovery, authority boundaries, unknown rules, duplicate-versus-fraud distinction, no input mutation, and rendering. Integrity tests use an independent Node SHA-256 expected value, canonical order, odd-node promotion, edited/deleted/renamed/reordered sections, format/digest tampering and wholesale recomputation against the retained root.
- The independent CLI returned MATCH for an unchanged synthetic bundle and MISMATCH after modifying an approval. The actual Browser-downloaded admission snapshot also returned MATCH against the root displayed by the connected portal: `b8729b307e94d2b5fd23fab0b87b30c97d07d47929cfe23941ff59e65a94ad73`. This root identifies one local synthetic snapshot, not an official record.
- Browser verified an accepted admission's export and an existing duplicate rejection's expanded guidance. The duplicate guidance requests accountable reconciliation without treating a match as fraud or suggesting identity changes. Browser console warnings/errors were empty. A390px viewport had375px document width; the temporary viewport was reset.
- The connected portal was rebuilt and run on127.0.0.1:5175 against real existing PostgreSQL persistence. Docker Desktop had stopped and was restarted. No data volume was deleted. The fresh full-system regression passed: seven roles, governed implementation, duplicate rejection, cancellation/readmission, capacity reconciliation, printable record, restart persistence and signature verification after restart. The74 earlier Testcontainers cases were not rerun for this UI-only change.
- Credential scan and `git diff --check` passed. Existing presentation work and unrelated untracked artifacts are preserved separately.

## Claim boundaries

This is deterministic guidance, not a minimum-cost correction solver or a new admission decision. The panel cannot approve evidence, increase capacity, change protected categories or implement a governed request. It preserves unknown rules for review, does not replay historical decisions, and requires current server validation for subsequent submissions.

The exported root covers the stored evidence and versioned guidance included in the file. It detects semantic changes relative to a separately retained root. Reformatting JSON or reordering object keys does not change meaning. It is not a digital signature, independently anchored transparency log, trusted timestamp or proof of complete database history. An attacker controlling both the snapshot and expected root can replace both. The export contains record evidence and must not be shared as an unrestricted public credential.

The work does not establish a novelty score, universal uniqueness, measured user benefit or real institution pilot. It is a bounded implementation of adoption guidance and tamper-evident snapshots from the proposed feature list; full daily transparency logs and independent time anchoring remain unimplemented.

Logs are ignored local files: `tmp/resolution-final-check.log`, `tmp/resolution-full-system.log`, `tmp/resolution-final-portal.log`. No dependencies or migrations were added.
