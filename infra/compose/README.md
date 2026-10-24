# Local infrastructure

The intended local stack is PostgreSQL, Keycloak, OPA, an object-store emulator, malware scanning, an observability collector and a notification sink. Temporal, Kafka, Debezium and OpenSearch should be added only when the corresponding workflow is implemented.

No compose file is claimed runnable yet because Docker is not installed on this machine and untested infrastructure would create false confidence. Image versions will be pinned by digest after the local runtime and approved versions are selected.
