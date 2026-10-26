import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type {
  AcademicIdentityPort,
  ApprovalImportManifest,
  ApprovalImportPort,
  AuthenticationPort,
  ExistingServiceTransportPort,
  GatewayClock,
  Principal,
} from './model.js';
import { GatewayProblem } from './model.js';
import { authorize } from './auth.js';
import type { NotificationWorker } from './notifications.js';
import type { CreateVerificationInput, VerificationService } from './verification.js';

export interface GatewayHttpDependencies {
  readonly approvalImporter: ApprovalImportPort;
  readonly authenticator: AuthenticationPort;
  readonly clock: GatewayClock;
  readonly dependencies: () => Readonly<Record<string, 'UP' | 'DEGRADED' | 'DISABLED'>>;
  readonly existingServices: ExistingServiceTransportPort;
  readonly identityVerifier: AcademicIdentityPort;
  readonly nextCorrelationReference: () => string;
  readonly notificationWorker: NotificationWorker;
  readonly verificationService: VerificationService;
}

export interface GatewayHttpOptions {
  readonly host: string;
  readonly maximumJsonBytes: number;
  readonly port: number;
  readonly requestTimeoutMs: number;
  readonly requestsPerMinute: number;
}

interface ProblemBody {
  readonly detail: string;
  readonly errors: readonly { readonly code: string; readonly message: string }[];
  readonly status: number;
  readonly title: string;
  readonly traceId: string;
  readonly type: string;
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  correlationReference: string,
): void {
  const content = JSON.stringify(body);
  res.writeHead(status, {
    'content-length': Buffer.byteLength(content),
    'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    'x-correlation-id': correlationReference,
  });
  res.end(content);
}

async function readJson(
  req: IncomingMessage,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new GatewayProblem('CONTENT_TYPE_UNSUPPORTED', 415, 'Use application/json.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maximumBytes)
      throw new GatewayProblem('REQUEST_TOO_LARGE', 413, 'The request is too large.');
    chunks.push(buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw new GatewayProblem('REQUEST_JSON_INVALID', 422, 'The JSON request body is invalid.');
  }
}

function requiredString(body: Readonly<Record<string, unknown>>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${key} is required.`);
  }
  return value;
}

export class GatewayHttpApplication {
  private readonly server: Server;
  private readonly rate = new Map<string, { count: number; minute: number }>();

  public constructor(
    private readonly dependencies: GatewayHttpDependencies,
    private readonly options: GatewayHttpOptions,
  ) {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server.requestTimeout = this.options.requestTimeoutMs;
  }

  public async start(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        resolve();
      });
    });
    const address = this.server.address();
    return typeof address === 'object' && address !== null ? address.port : this.options.port;
  }

  public async stop(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      });
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const correlationReference =
      (Array.isArray(req.headers['x-correlation-id'])
        ? req.headers['x-correlation-id'][0]
        : req.headers['x-correlation-id']) ?? this.dependencies.nextCorrelationReference();
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {
        send(res, 200, { status: 'UP' }, correlationReference);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/ready') {
        const states = this.dependencies.dependencies();
        const ready = !Object.values(states).includes('DEGRADED');
        send(
          res,
          ready ? 200 : 503,
          { dependencies: states, status: ready ? 'UP' : 'DEGRADED' },
          correlationReference,
        );
        return;
      }
      const principal = await this.authenticate(req);
      this.limit(principal);
      if (req.method === 'GET' && url.pathname === '/v1/dependencies') {
        authorize(principal, 'AUDIT_READ');
        send(res, 200, { dependencies: this.dependencies.dependencies() }, correlationReference);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/academic-identity/verifications') {
        authorize(principal, 'IDENTITY_VERIFY');
        const body = await readJson(req, this.options.maximumJsonBytes);
        const purpose = requiredString(body, 'purpose');
        if (!['ADMISSION_LINKING', 'CORRECTION_REVIEW'].includes(purpose)) {
          throw new GatewayProblem(
            'REQUEST_VALIDATION_FAILED',
            422,
            'The verification purpose is invalid.',
          );
        }
        const result = await this.dependencies.identityVerifier.verify({
          academicIdentity: requiredString(body, 'academicIdentity'),
          correlationReference,
          purpose: purpose as 'ADMISSION_LINKING' | 'CORRECTION_REVIEW',
        });
        send(res, 200, result, correlationReference);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/integration/approval-imports') {
        authorize(principal, 'APPROVAL_IMPORT');
        const manifest = (await readJson(
          req,
          this.options.maximumJsonBytes,
        )) as unknown as ApprovalImportManifest;
        send(
          res,
          201,
          await this.dependencies.approvalImporter.import(manifest, principal),
          correlationReference,
        );
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/verifications') {
        authorize(principal, 'VERIFICATION_CREATE');
        const body = await readJson(req, this.options.maximumJsonBytes);
        const idempotencyHeader = req.headers['idempotency-key'];
        const idempotencyKey = Array.isArray(idempotencyHeader)
          ? idempotencyHeader[0]
          : idempotencyHeader;
        if (idempotencyKey === undefined || idempotencyKey.trim() === '') {
          throw new GatewayProblem('IDEMPOTENCY_KEY_REQUIRED', 422, 'Idempotency-Key is required.');
        }
        const input = { ...body, idempotencyKey } as unknown as CreateVerificationInput;
        send(
          res,
          200,
          await this.dependencies.verificationService.create(input, principal),
          correlationReference,
        );
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/notifications/process') {
        authorize(principal, 'NOTIFICATION_PROCESS');
        send(
          res,
          200,
          {
            delivery: await this.dependencies.notificationWorker.processOne(
              this.dependencies.clock.now(),
            ),
          },
          correlationReference,
        );
        return;
      }
      const institutionCase = /^\/v1\/institutions\/([^/]+)\/cases$/.exec(url.pathname);
      if (req.method === 'POST' && institutionCase?.[1] !== undefined) {
        authorize(principal, 'CASE_CREATE', decodeURIComponent(institutionCase[1]));
        const body = await readJson(req, this.options.maximumJsonBytes);
        send(
          res,
          201,
          await this.dependencies.existingServices.execute('CASE_CREATE', body, principal),
          correlationReference,
        );
        return;
      }
      const caseRecommendation = /^\/v1\/cases\/([^/]+)\/recommendations$/.exec(url.pathname);
      if (req.method === 'POST' && caseRecommendation !== null) {
        authorize(principal, 'CASE_RECOMMEND');
        const body = await readJson(req, this.options.maximumJsonBytes);
        send(
          res,
          200,
          await this.dependencies.existingServices.execute('CASE_RECOMMEND', body, principal),
          correlationReference,
        );
        return;
      }
      const caseDecision = /^\/v1\/cases\/([^/]+)\/decisions$/.exec(url.pathname);
      if (req.method === 'POST' && caseDecision !== null) {
        authorize(principal, 'CASE_DECIDE');
        const body = await readJson(req, this.options.maximumJsonBytes);
        send(
          res,
          200,
          await this.dependencies.existingServices.execute('CASE_DECIDE', body, principal),
          correlationReference,
        );
        return;
      }
      throw new GatewayProblem('ROUTE_NOT_FOUND', 404, 'The route was not found.');
    } catch (error) {
      const problem =
        error instanceof GatewayProblem
          ? error
          : new GatewayProblem('INTERNAL_ERROR', 500, 'The request could not be completed.');
      const body: ProblemBody = {
        detail: problem.message,
        errors: [{ code: problem.code, message: problem.message }],
        status: problem.status,
        title: problem.status === 401 ? 'Unauthenticated' : 'Request failed',
        traceId: correlationReference,
        type: `urn:apaar-platform:problem:${problem.code.toLowerCase().replaceAll('_', '-')}`,
      };
      send(res, problem.status, body, correlationReference);
    }
  }

  private async authenticate(req: IncomingMessage): Promise<Principal> {
    const authorization = req.headers.authorization;
    const principal = await this.dependencies.authenticator.authenticate(authorization);
    if (principal === null)
      throw new GatewayProblem('UNAUTHENTICATED', 401, 'Authentication is required.');
    return principal;
  }

  private limit(principal: Principal): void {
    const minute = Math.floor(Date.parse(this.dependencies.clock.now()) / 60_000);
    const current = this.rate.get(principal.actorReference);
    const next =
      current?.minute === minute ? { count: current.count + 1, minute } : { count: 1, minute };
    this.rate.set(principal.actorReference, next);
    if (next.count > this.options.requestsPerMinute) {
      throw new GatewayProblem('RATE_LIMIT_EXCEEDED', 429, 'The request rate limit was exceeded.');
    }
  }
}
