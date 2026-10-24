# Admission domain

Framework-independent admission and capacity policy kernel. It accepts an immutable approval snapshot, current capacity usage and a proposed admission, then returns a deterministic decision with stable rule codes.

The package performs no network, clock, filesystem or database work. Application services use the ports in `src/ports.ts`; future persistence must enforce the accepted reservation in the same protected transaction as the admission write.

## Commands

Run from the repository root:

```text
npm run typecheck
npm test
npm run test:coverage
npm run build
```

## Deliberate boundaries

- Absolute capacities come from an effective-dated approval snapshot. The kernel does not invent rounding rules for percentage-based schemes.
- Provider outages and unresolved policy produce manual review, not an adverse identity judgment.
- A returned reservation is a decision proposal. It becomes authoritative only when a later PostgreSQL adapter locks capacity and commits the admission transactionally.
