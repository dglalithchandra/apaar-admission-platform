import { PostgresVerificationGrantRepository } from './verification-authorization-postgres.js';
import { GrantVerificationAuthorization } from './verification-authorization.js';
import { randomUUID } from 'node:crypto';
import { DisabledSigningAdapter } from './ed25519-signing.js';
import type { SigningPort } from './model.js';
import {
  PostgresAdmissionStore,
  SubmitAdmissionService,
  type ReferenceGenerator,
} from '@apaar-platform/admission-application';
import {
  BatchQueryService,
  BatchWorker,
  CreateBatchService,
  DeterministicAcademicIdentityVerifier,
  DeterministicMalwareScanner,
  PostgresBatchRepository,
} from '@apaar-platform/batch-ingestion';
import type { Pool } from 'pg';
import { asIsoDateTime } from '@apaar-platform/admission-domain';
import { AcademicIdentitySimulator } from './academic-identity.js';
import { ApprovalImportService } from './approval-import.js';
import { SyntheticTokenAuthenticator } from './auth.js';
import { StructuralContractValidator } from './contracts.js';
import type { GatewayConfig } from './config.js';
import type { GatewayHttpDependencies } from './http.js';
import type { GatewayClock, Principal } from './model.js';
import { SyntheticNotificationGateway, NotificationWorker } from './notifications.js';
import { InMemoryGatewayTelemetry } from './observability.js';
import { PilotExecutionService, PilotWorkerService } from './pilot-execution.js';
import {
  PostgresPilotExecutionRepository,
  PostgresPilotWorkerRepository,
} from './pilot-execution-postgres.js';
import { PostgresPilotRepository } from './pilot-postgres.js';
import { PilotRolloutService } from './pilot-rollout.js';
import { PostgresDelegatedTransport } from './postgres-delegated-transport.js';
import {
  PostgresAdmissionFacts,
  PostgresBatchJobRepository,
  PostgresObjectStorage,
  PostgresOperationalEventStream,
  PostgresWorkerHeartbeat,
  SyntheticReferenceGenerator,
} from './reference-persistence.js';
import { PostgresIntegrationStore } from './postgres-store.js';
import { SyntheticManifestIntegrityAdapter } from './approval-import.js';
import { VerificationService, VerificationStatusService } from './verification.js';

class SyntheticAdmissionReferences implements ReferenceGenerator {
  public next(
    kind: 'ADMISSION' | 'DECISION' | 'IDENTITY' | 'AUDIT' | 'OUTBOX' | 'REGISTRATION',
  ): string {
    return `SYNTH-${kind}-${randomUUID().toUpperCase()}`;
  }
}

export const SYNTHETIC_PRINCIPALS: readonly [string, Principal][] = [
  [
    'SYNTH-TOKEN-INSTITUTION-OPERATOR',
    {
      actorReference: 'SYNTH-OPERATOR-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      organisationReference: 'SYNTH-INSTITUTION-001',
      roles: ['INSTITUTION_OPERATOR'],
    },
  ],
  [
    'SYNTH-TOKEN-INSTITUTION-ADMIN',
    {
      actorReference: 'SYNTH-ADMIN-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      organisationReference: 'SYNTH-INSTITUTION-001',
      roles: ['INSTITUTION_ADMINISTRATOR'],
    },
  ],
  [
    'SYNTH-TOKEN-REVIEWER',
    {
      actorReference: 'SYNTH-REVIEWER-001',
      institutionId: null,
      organisationReference: 'SYNTH-AICTE',
      roles: ['AICTE_REVIEWER'],
    },
  ],
  [
    'SYNTH-TOKEN-CHECKER',
    {
      actorReference: 'SYNTH-CHECKER-001',
      institutionId: null,
      organisationReference: 'SYNTH-AICTE',
      roles: ['AICTE_CHECKER'],
    },
  ],
  [
    'SYNTH-TOKEN-AUDITOR',
    {
      actorReference: 'SYNTH-AUDITOR-001',
      institutionId: null,
      organisationReference: 'SYNTH-AICTE',
      roles: ['AUDITOR'],
    },
  ],
  [
    'SYNTH-TOKEN-VERIFIER',
    {
      actorReference: 'SYNTH-VERIFIER-001',
      institutionId: null,
      organisationReference: 'SYNTH-VERIFIER-ORG',
      roles: ['AUTHORIZED_VERIFIER'],
    },
  ],
  [
    'SYNTH-TOKEN-INTEGRATION',
    {
      actorReference: 'SYNTH-INTEGRATION-001',
      institutionId: null,
      organisationReference: 'SYNTH-AICTE',
      roles: ['SERVICE_INTEGRATION_CLIENT'],
    },
  ],
];

export interface ReferenceRuntime {
  readonly dependencies: GatewayHttpDependencies;
  readonly batchJobs: PostgresBatchJobRepository;
  readonly batchWorker: BatchWorker;
  readonly heartbeat: PostgresWorkerHeartbeat;
  readonly pilotWorker: PilotWorkerService;
}

export function createReferenceRuntime(
  pool: Pool,
  config: GatewayConfig,
  signing: SigningPort = new DisabledSigningAdapter(),
  clock: GatewayClock = { now: () => new Date().toISOString() },
): ReferenceRuntime {
  const admissionStore = new PostgresAdmissionStore(pool);
  const admissions = new SubmitAdmissionService(
    {
      clock: { now: (): ReturnType<typeof asIsoDateTime> => asIsoDateTime(clock.now()) },
      unitOfWork: admissionStore,
    },
    new SyntheticAdmissionReferences(),
  );
  const batchRepository = new PostgresBatchRepository(pool);
  const batchJobs = new PostgresBatchJobRepository(pool);
  const batchWorker = new BatchWorker({
    admissions,
    clock,
    identity: new DeterministicAcademicIdentityVerifier(),
    repository: batchRepository,
  });
  const batchCreate = new CreateBatchService({
    clock,
    references: new SyntheticReferenceGenerator(),
    repository: batchRepository,
    scanner: new DeterministicMalwareScanner(),
    storage: new PostgresObjectStorage(pool),
  });
  const pilotRepository = new PostgresPilotRepository(pool);
  const pilotService = new PilotRolloutService(
    pilotRepository,
    () => clock.now(),
    () => `SYNTH-MIGRATION-${randomUUID().toUpperCase()}`,
  );
  const executionRepository = new PostgresPilotExecutionRepository(pool);
  const executionService = new PilotExecutionService(
    executionRepository,
    () => clock.now(),
    () => `SYNTH-ASSESSMENT-${randomUUID().toUpperCase()}`,
    () => `SYNTH-REPORT-${randomUUID().toUpperCase()}`,
  );
  const pilotWorker = new PilotWorkerService(new PostgresPilotWorkerRepository(pool), () =>
    clock.now(),
  );
  const store = new PostgresIntegrationStore(pool);
  const telemetry = new InMemoryGatewayTelemetry();
  const transport = new PostgresDelegatedTransport({
    verificationPublicKey: signing.exportPublicKey?.() ?? null,
    batchCreate,
    batchJobs,
    batchQuery: new BatchQueryService(batchRepository),
    executionRepository,
    executionService,
    pilotRepository,
    pilotService,
    pool,
  });
  const heartbeat = new PostgresWorkerHeartbeat(pool);
  let reference = 0;
  const dependencies: GatewayHttpDependencies = {
    approvalImporter: new ApprovalImportService(
      store,
      new SyntheticManifestIntegrityAdapter(config.environment),
    ),
    authenticator: new SyntheticTokenAuthenticator(
      config.environment,
      new Map(SYNTHETIC_PRINCIPALS),
    ),
    clock,
    contractValidator: new StructuralContractValidator(),
    dependencies: async () => {
      try {
        await pool.query('SELECT 1');
        return {
          apaar: config.apaarMode === 'simulator' ? 'UP' : 'DISABLED',
          database: 'UP',
          notifications: 'UP',
          ...(await heartbeat.states()),
        } as const;
      } catch {
        return { apaar: 'DEGRADED', database: 'DEGRADED', notifications: 'DEGRADED' } as const;
      }
    },
    existingServices: transport,
    events: new PostgresOperationalEventStream(pool),
    identityVerifier: new AcademicIdentitySimulator(clock),
    nextCorrelationReference: () => `SYNTH-CORRELATION-${String(++reference).padStart(8, '0')}`,
    notificationWorker: new NotificationWorker(store, new SyntheticNotificationGateway()),
    referenceTokens: Object.fromEntries(
      SYNTHETIC_PRINCIPALS.map(([token, principal]) => [principal.roles[0] ?? '', token]),
    ),
    securityEvents: store,
    telemetry,
    verificationService: new VerificationService(
      new PostgresAdmissionFacts(pool),
      store,
      signing,
      clock,
      () => `SYNTH-VERIFICATION-${randomUUID().toUpperCase()}`,
      new GrantVerificationAuthorization(new PostgresVerificationGrantRepository(pool), clock),
    ),
    verificationStatusService: new VerificationStatusService(store, clock, signing),
  };
  return { batchJobs, batchWorker, dependencies, heartbeat, pilotWorker };
}
