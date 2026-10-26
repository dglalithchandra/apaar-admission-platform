# Local infrastructure

`compose.yaml` runs only components exercised by the current build: pinned PostgreSQL 17.6 and the integration gateway image. The gateway is explicitly configured for a synthetic development environment and reports external providers as simulated or disabled. It is not a live AICTE or APAAR deployment.

Run from the repository root:

```text
docker compose -f infra/compose/compose.yaml up --build --wait
docker compose -f infra/compose/compose.yaml down
```

The gateway runs as a non-root user with a read-only filesystem, dropped Linux capabilities, a health check and graceful termination. PostgreSQL stores data in the named `apaar-postgres-data` volume. `infra/postgres/create-roles.sql` defines separate `NOLOGIN` migration and runtime group roles; deployment automation must create login roles and credentials through its secret manager.

Keycloak, OPA, an object-store emulator, malware scanning and an observability collector remain future additions only when their application paths are exercised. Temporal, Kafka, Debezium and OpenSearch must not be added speculatively.
