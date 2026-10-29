# Institutional UI refresh

29 October 2026. Scope: shared visual styling across upload, admissions, casework, integration assurance, pilot execution, Policy Lab and capacity oversight. No routes, API contracts, authentication, policy or persistence logic changed. One existing malformed loading-label character was corrected.

## Design

Off-white canvas, graphite typography and deep indigo actions. Translucency is limited to the sticky header and navigation. Data panels, forms and evidence remain solid white. Metric groups use shared surfaces and dividers instead of repeated elevated cards. Controls, typography, table spacing, focus states, empty states, disclosures and semantic feedback share the same design tokens. Policy Lab no longer uses a decorative gradient hero. Reduced-motion and reduced-transparency preferences have fallbacks.

## Verification

- `npm run check` passed347 unit/component tests with the refreshed shared styles, including formatting, lint, build, type checking, coverage and contracts. The final loading-copy correction was followed by a fresh89-test portal run and production build. Remaining packages were unchanged.
- The final CSS refinements passed production build and formatting. The built Compose portal runs on127.0.0.1:5175 using existing services/data. No dependency, migration or backend change was introduced.
- Browser navigated all seven workspaces at desktop and390px phone width. Phone document widths were375–390px, without page-level horizontal overflow. Tables retain their own horizontal scroll when required. Casework uses one column below1200px. Temporary viewport overrides were reset.
- Actual rendered upload, admissions, casework, integration, pilot and Policy Lab surfaces were visually inspected. Capacity controls received the shared input style. The final build's computed header blur was18px, navigation blur12px and panel blur none. This caught and repaired an optimizer issue that initially emitted only an ineffective legacy blur declaration.
- Browser exercised empty admission search, successful stored admission lookup and decision disclosure, report loading and verifier upload denial. No new admission or case was created during this visual review. Console warning/error logs were empty.
- Production CSS is32.64kB,7.39kB gzip. No new fonts, external visual assets or runtime libraries were downloaded. Existing system-font fallbacks remain supported.

These are local synthetic checks, not formal assistive-technology certification, an exhaustive browser matrix or production deployment approval. The previous PostgreSQL transaction evidence remains applicable to unchanged backend code; those suites were not rerun for styling.

Local ignored evidence: `tmp/glass-ui-check.log`, `tmp/glass-ui-portal-tests.log`, `tmp/glass-ui-final-build.log`, `tmp/glass-ui-final-format.log`, `tmp/glass-ui-final-compose.log`, `tmp/glass-final-desktop.png`, `tmp/glass-final-mobile.png`.
