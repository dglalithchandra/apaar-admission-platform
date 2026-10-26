import {
  AcademicIdentitySimulator,
  ApprovalImportService,
  InMemoryAdmissionFacts,
  InMemoryApprovalManifestRepository,
  InMemoryNotificationRepository,
  InMemoryGatewayTelemetry,
  InMemorySecurityEventWriter,
  InMemoryVerificationReceiptRepository,
  NotificationWorker,
  StructuralContractValidator,
  SyntheticNotificationGateway,
  SyntheticManifestIntegrityAdapter,
  SyntheticSigningAdapter,
  SyntheticTokenAuthenticator,
  VerificationService,
  VerificationStatusService,
} from './index.js';
import { GatewayHttpApplication } from './http.js';
import { loadGatewayConfig } from './config.js';
import {
  GatewayProblem,
  type GatewayClock,
  type GatewayTransportResponse,
  type Principal,
} from './model.js';
import { delegatedSuccessStatus } from './routes.js';

const config = loadGatewayConfig(process.env);
if (!config.syntheticAuthentication) {
  throw new GatewayProblem(
    'EXTERNAL_IDENTITY_PROVIDER_UNAVAILABLE',
    500,
    'An approved OIDC verifier must be configured when synthetic authentication is disabled.',
  );
}

const clock: GatewayClock = { now: () => new Date().toISOString() };
const principals: readonly [string, Principal][] = [
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
const receipts = new InMemoryVerificationReceiptRepository();
const telemetry = new InMemoryGatewayTelemetry();
let reference = 0;
const application = new GatewayHttpApplication(
  {
    approvalImporter: new ApprovalImportService(
      new InMemoryApprovalManifestRepository(),
      new SyntheticManifestIntegrityAdapter(config.environment),
    ),
    authenticator: new SyntheticTokenAuthenticator(config.environment, new Map(principals)),
    clock,
    contractValidator: new StructuralContractValidator(),
    dependencies: (): Readonly<Record<string, 'UP' | 'DEGRADED' | 'DISABLED'>> => ({
      apaar: config.apaarMode === 'simulator' ? 'UP' : 'DISABLED',
      database: 'DISABLED',
      notifications: 'DISABLED',
    }),
    existingServices: {
      execute: (operation, input): Promise<GatewayTransportResponse> =>
        Promise.resolve(
          operation.startsWith('download')
            ? { body: 'SYNTHETIC,LOCAL,ONLY\r\n', contentType: 'text/csv', status: 200 }
            : {
                body: { input, operation, state: 'SYNTHETIC_LOCAL_ONLY' },
                status: delegatedSuccessStatus(operation),
              },
        ),
    },
    identityVerifier: new AcademicIdentitySimulator(clock),
    nextCorrelationReference: (): string =>
      `SYNTH-CORRELATION-${String(++reference).padStart(6, '0')}`,
    notificationWorker: new NotificationWorker(
      new InMemoryNotificationRepository([]),
      new SyntheticNotificationGateway(),
    ),
    securityEvents: new InMemorySecurityEventWriter(),
    telemetry,
    verificationService: new VerificationService(
      new InMemoryAdmissionFacts(
        new Map([
          [
            'SYNTH-REGISTRATION-001',
            {
              academicYear: '2026-27',
              admissionReference: 'SYNTH-REGISTRATION-001',
              currentStatus: 'ACCEPTED',
              institutionReference: 'SYNTH-INSTITUTION-001',
              programmeReference: 'SYNTH-PROGRAMME-001',
            },
          ],
        ]),
      ),
      receipts,
      new SyntheticSigningAdapter(),
      clock,
      () => `SYNTH-VERIFICATION-${String(++reference).padStart(6, '0')}`,
    ),
    verificationStatusService: new VerificationStatusService(
      receipts,
      clock,
      new SyntheticSigningAdapter(),
    ),
  },
  {
    allowedOrigins: config.allowedOrigins,
    host: config.host,
    maximumJsonBytes: config.maximumJsonBytes,
    maximumUploadBytes: config.maximumUploadBytes,
    port: config.port,
    requestTimeoutMs: config.requestTimeoutMs,
    requestsPerMinute: config.requestsPerMinute,
  },
);

const port = await application.start();
process.stdout.write(
  `integration-gateway listening on ${config.host}:${String(port)} (${config.environment})\n`,
);

const shutdown = async (): Promise<void> => {
  await application.stop();
  process.exitCode = 0;
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
