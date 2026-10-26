# ADR-0011: One role-based casework workspace

- Status: accepted
- Date: 26 October 2026

## Context

Institutions, AICTE reviewers and independent checkers act on the same case aggregate but have different permissions and tasks. Separate prototype applications would duplicate state language, drift from the OpenAPI contract and make handoffs difficult to test. At the same time, a frontend role selector must never be mistaken for production authorization.

## Decision

Extend the existing React/Vite portal with one casework workspace and role-specific action surfaces. The queue, filters, case detail, policy provenance, expected version and latest recorded action remain consistent across roles. Institutions can create a draft, submit it and answer an information request. Reviewers can start review, declare a conflict and only recommend after a clear declaration. Checkers decide recommendations and must perform a separate confirmation before an approved cancellation or transfer is implemented.

The UI depends on a `CaseworkClient` port. `DemoCaseworkClient` is an all-synthetic stateful simulator for tests, Storybook and browser acceptance. It does not represent an authentication system and does not call the PostgreSQL repository. A production adapter will map the versioned OpenAPI contract and obtain the role, institution scope and actor reference from trusted server-validated identity claims.

Implementation is deliberately explicit about consequence. Creating a draft says it does not change an admission. Approval says implementation remains separate. The implementation confirmation explains atomic capacity change and preservation of the original decision. Successful implementation displays an immutable receipt rather than silently removing the case.

## Consequences

- The three role journeys reuse one vocabulary and responsive layout while exposing only relevant actions.
- The synthetic role preview makes development and acceptance faster but must not ship as a production privilege control.
- UI state is not regulatory truth; production actions must still pass service authorization, optimistic version checks, policy authority and database constraints.
- Interaction tests and Storybook stories can exercise complete handoffs without real student data or external services.
- A production HTTP adapter, authenticated session shell, route-level code splitting and formal accessibility assurance remain later work.
