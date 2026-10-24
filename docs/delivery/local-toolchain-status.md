# Local toolchain status

Observed on 24 October 2026:

| Tool | Status | Effect |
|---|---|---|
| Git | 2.55.0 | Repository and shallow reference clones work. |
| Node.js | 24.19.0 | Application, domain and frontend tooling can run. |
| npm | 11.17.0 | Package installation can run. |
| Java | Not found | Not required by the current TypeScript application decision in ADR-0005. |
| Docker | Not found | Keycloak/PostgreSQL/OPA/Temporal containers cannot run locally yet. Docker Desktop, Rancher Desktop or an approved remote environment is required. |

System-wide installation was not attempted because the user's permission was explicitly for this workspace and downloads, not for changing operating-system configuration or accepting third-party desktop licences.
