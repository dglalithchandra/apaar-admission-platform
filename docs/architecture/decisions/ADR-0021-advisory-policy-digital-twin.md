# ADR-0021: Advisory admission policy digital twin

## Status

Accepted on 27 October 2026.

## Context

The registry can prove whether an individual admission follows an approved rule. AICTE also needs
to understand the distributional and operational effect of a possible policy change before it is
approved. A predictive score or generative-AI answer would be difficult to audit and could be
mistaken for regulatory authority.

## Decision

Add a side-effect-free `policy-digital-twin` module. It replays the identical ordered cohort through
two immutable approval snapshots using the production admission policy engine. One snapshot is the
source-aligned synthetic baseline; the other is explicitly proposed. Each run maintains independent in-memory
capacity usage and returns aggregate outcomes, category impacts, changed decisions and changed rule
counts.

The first portal experience uses an entirely `SYNTH-` prefixed 84-admission cohort. It is available
only to synthetic AICTE reviewer, checker and auditor personas. It is labelled advisory, reports
that no ledger write occurs, and never recommends or activates policy automatically.

## Consequences

- Judges and policy users can see a meaningful national-governance use beyond data collection.
- Results are deterministic and explainable because they use the same versioned rules as admission
  decisions.
- The simulator cannot corrupt capacity because it has no repository or write port.
- Current evidence demonstrates one synthetic course-level cohort, not national forecasting.
- Production use would require approved, privacy-reviewed aggregate cohorts, signed scenario
  provenance and accountable policy approval outside the simulator.

## Handbook reconciliation

See [ADR-0024](ADR-0024-handbook-capacity-and-evidence-boundaries.md) for current-rule ceilings, hypothetical amendment separation, replay inputs and evidence provenance. Earlier numerical presentation snapshots are superseded.
