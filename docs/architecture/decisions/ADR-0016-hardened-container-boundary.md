# ADR-0016: hardened container boundary

## Status

Accepted locally on 26 October 2026. Production hosting remains authority-controlled.

## Decision

Build the integration gateway with a multi-stage image from the digest-pinned Node 24.19.0 Alpine base. The runtime installs production dependencies only, installs explicitly versioned security-fixed Alpine crypto/compression libraries, removes the build-only npm CLI, runs as the image's unprivileged `node` user and has an HTTP health check. The local deployment binds ports to loopback, uses a read-only root filesystem, a temporary writable `/tmp`, no new privileges and no Linux capabilities.

PostgreSQL 17.6 and k6 1.3.0 are also referenced by immutable image digests. Database data is the only named writable volume. Local compose values are visibly synthetic and are not production secret examples.

## Consequences

- `npm run test:container` proves the image builds, becomes healthy, is non-root and is read-only.
- A clean container build is an independent dependency-order check.
- Production orchestration, registry signing, network policy, secret injection and image promotion must be chosen by the hosting authority.
- The runtime does not contain the portal or source tree merely because they were build inputs.
