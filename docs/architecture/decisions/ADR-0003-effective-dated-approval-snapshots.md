# ADR-0003: Use effective-dated approval snapshots

Status: accepted

## Decision

Every capacity decision references the exact imported approval snapshot and ruleset version used. Corrections create a new version; they do not overwrite history.

## Why

Institution status, programme approvals and capacity may be amended after admissions begin. Auditors must be able to reproduce why a record was accepted on a particular date.

## Minimum provenance

Source system, source record ID, import batch, source hash, effective-from/to, received time, approved-by, superseded-by and policy version.
