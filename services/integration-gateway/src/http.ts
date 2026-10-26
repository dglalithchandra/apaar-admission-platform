import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type {
  AcademicIdentityPort,
  ApprovalImportManifest,
  ApprovalImportPort,
  AuthenticationPort,
  ContractValidationPort,
  ExistingServiceTransportPort,
  GatewayClock,
  GatewayTelemetryPort,
  Principal,
  SecurityEventPort,
} from './model.js';
import { GatewayProblem } from './model.js';
import { authorize } from './auth.js';
import type { NotificationWorker } from './notifications.js';
import type {
  CreateVerificationInput,
  VerificationService,
  VerificationStatusService,
} from './verification.js';
import { authorizeDelegatedRoute, matchDelegatedRoute, requireIdempotencyKey } from './routes.js';
import { sanitizeMetricRoute } from './observability.js';

export interface GatewayHttpDependencies {
  readonly approvalImporter: ApprovalImportPort;
  readonly authenticator: AuthenticationPort;
  readonly clock: GatewayClock;
  readonly contractValidator: ContractValidationPort;
  readonly dependencies: () => Readonly<Record<string, 'UP' | 'DEGRADED' | 'DISABLED'>>;
  readonly existingServices: ExistingServiceTransportPort;
  readonly identityVerifier: AcademicIdentityPort;
  readonly nextCorrelationReference: () => string;
  readonly notificationWorker: NotificationWorker;
  readonly verificationService: VerificationService;
  readonly verificationStatusService: VerificationStatusService;
  readonly telemetry: GatewayTelemetryPort;
  readonly securityEvents: SecurityEventPort;
}

export interface GatewayHttpOptions {
  readonly allowedOrigins: readonly string[];
  readonly host: string;
  readonly maximumJsonBytes: number;
  readonly maximumUploadBytes: number;
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
  options: {
    readonly contentType?: string | undefined;
    readonly headers?: Readonly<Record<string, string>> | undefined;
    readonly origin?: string | undefined;
  } = {},
): void {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(content),
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'content-type':
      options.contentType ?? (status >= 400 ? 'application/problem+json' : 'application/json'),
    'cross-origin-resource-policy': 'same-site',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-correlation-id': correlationReference,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...(options.origin === undefined ? {} : { 'access-control-allow-origin': options.origin }),
    ...options.headers,
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

async function readMultipart(
  req: IncomingMessage,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = /multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(
    contentType,
  );
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (boundary === undefined) {
    throw new GatewayProblem(
      'CONTENT_TYPE_UNSUPPORTED',
      415,
      'Use multipart/form-data with a boundary.',
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maximumBytes) {
      throw new GatewayProblem('UPLOAD_TOO_LARGE', 413, 'The upload is too large.');
    }
    chunks.push(buffer);
  }
  const fields: Record<string, unknown> = {};
  for (const rawPart of Buffer.concat(chunks).toString('utf8').split(`--${boundary}`)) {
    const part = rawPart.replace(/^\r\n|\r\n$/g, '');
    if (part === '' || part === '--') continue;
    const separator = part.indexOf('\r\n\r\n');
    if (separator < 0) {
      throw new GatewayProblem('MULTIPART_INVALID', 422, 'The multipart upload is malformed.');
    }
    const headers = part.slice(0, separator);
    const name = /content-disposition:[^\r\n]*\bname="([^"]+)"/i.exec(headers)?.[1];
    if (name === undefined || fields[name] !== undefined) {
      throw new GatewayProblem('MULTIPART_INVALID', 422, 'The multipart upload is malformed.');
    }
    const value = part.slice(separator + 4).replace(/\r\n$/, '');
    fields[name] = /\bfilename="[^"]*"/i.test(headers) ? Buffer.from(value, 'utf8') : value;
  }
  for (const required of [
    'file',
    'templateVersion',
    'actorReference',
    'reason',
    'requestReference',
  ]) {
    if (fields[required] === undefined) {
      throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${required} is required.`);
    }
  }
  return fields;
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
    const started = performance.now();
    const observedPath = new URL(req.url ?? '/', 'http://localhost').pathname;
    res.once('finish', () => {
      this.dependencies.telemetry.record({
        durationMilliseconds: performance.now() - started,
        method: req.method ?? 'UNKNOWN',
        route: observedPath,
        status: res.statusCode,
      });
    });
    const correlationReference =
      (Array.isArray(req.headers['x-correlation-id'])
        ? req.headers['x-correlation-id'][0]
        : req.headers['x-correlation-id']) ?? this.dependencies.nextCorrelationReference();
    let actorReference = 'SYNTH-UNAUTHENTICATED';
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const origin = this.allowedOrigin(req.headers.origin);
      if (req.headers.origin !== undefined && origin === undefined) {
        throw new GatewayProblem('ORIGIN_FORBIDDEN', 403, 'The request origin is not allowed.');
      }
      if (req.method === 'OPTIONS') {
        send(res, 204, '', correlationReference, {
          headers: {
            'access-control-allow-headers':
              'authorization,content-type,idempotency-key,x-correlation-id',
            'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
            'access-control-max-age': '600',
          },
          origin,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        send(res, 200, { status: 'UP' }, correlationReference, { origin });
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
          { origin },
        );
        return;
      }
      const principal = await this.authenticate(req);
      actorReference = principal.actorReference;
      this.limit(principal);
      if (req.method === 'GET' && url.pathname === '/v1/dependencies') {
        authorize(principal, 'AUDIT_READ');
        send(res, 200, { dependencies: this.dependencies.dependencies() }, correlationReference, {
          origin,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/metrics') {
        authorize(principal, 'AUDIT_READ');
        send(res, 200, this.dependencies.telemetry.prometheus(), correlationReference, {
          contentType: 'text/plain; version=0.0.4; charset=utf-8',
          origin,
        });
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
        send(res, 200, result, correlationReference, { origin });
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
          { origin },
        );
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/verifications') {
        authorize(principal, 'VERIFICATION_CREATE');
        const body = await readJson(req, this.options.maximumJsonBytes);
        const idempotencyKey = requireIdempotencyKey(req.headers['idempotency-key']);
        const input = { ...body, idempotencyKey } as unknown as CreateVerificationInput;
        send(
          res,
          200,
          await this.dependencies.verificationService.create(input, principal),
          correlationReference,
          { origin },
        );
        return;
      }
      const verificationStatus = /^\/v1\/verifications\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && verificationStatus?.[1] !== undefined) {
        authorize(principal, 'VERIFICATION_READ');
        send(
          res,
          200,
          await this.dependencies.verificationStatusService.get(
            decodeURIComponent(verificationStatus[1]),
          ),
          correlationReference,
          { origin },
        );
        return;
      }
      const verificationRevocation = /^\/v1\/verifications\/([^/]+)\/revocations$/.exec(
        url.pathname,
      );
      if (req.method === 'POST' && verificationRevocation?.[1] !== undefined) {
        authorize(principal, 'VERIFICATION_REVOKE');
        const body = await readJson(req, this.options.maximumJsonBytes);
        await this.dependencies.verificationStatusService.revoke(
          decodeURIComponent(verificationRevocation[1]),
          requiredString(body, 'reason'),
          principal,
        );
        send(res, 204, '', correlationReference, { origin });
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
          { origin },
        );
        return;
      }
      const delegated = matchDelegatedRoute(req.method, url.pathname);
      if (delegated !== null) {
        authorizeDelegatedRoute(principal, delegated);
        const body =
          delegated.route.body === 'JSON'
            ? await readJson(req, this.options.maximumJsonBytes)
            : delegated.route.body === 'MULTIPART'
              ? await readMultipart(req, this.options.maximumUploadBytes)
              : {};
        const idempotencyKey = delegated.route.idempotent
          ? requireIdempotencyKey(req.headers['idempotency-key'])
          : null;
        const input = {
          ...body,
          ...(idempotencyKey === null ? {} : { idempotencyKey }),
          path: delegated.path,
          query: Object.fromEntries(url.searchParams),
        };
        this.dependencies.contractValidator.validateRequest(delegated.route.operationId, input);
        const response = await this.dependencies.existingServices.execute(
          delegated.route.operationId,
          input,
          principal,
        );
        this.dependencies.contractValidator.validateResponse(delegated.route.operationId, response);
        if (response.status !== delegated.route.status) {
          throw new GatewayProblem(
            'RESPONSE_CONTRACT_VIOLATION',
            502,
            'A downstream service returned an undocumented success status.',
          );
        }
        send(res, response.status, response.body, correlationReference, {
          contentType: response.contentType,
          headers: response.headers,
          origin,
        });
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
      if (
        [
          'ACTION_FORBIDDEN',
          'ORIGIN_FORBIDDEN',
          'RATE_LIMIT_EXCEEDED',
          'TENANT_SCOPE_DENIED',
          'UNAUTHENTICATED',
        ].includes(problem.code)
      ) {
        await this.dependencies.securityEvents.record({
          actorReference,
          correlationReference,
          details: {
            method: req.method ?? 'UNKNOWN',
            route: sanitizeMetricRoute(observedPath),
            status: problem.status,
          },
          eventCode: problem.code,
        });
      }
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

  private allowedOrigin(origin: string | undefined): string | undefined {
    if (origin === undefined) return undefined;
    return this.options.allowedOrigins.includes(origin) ? origin : undefined;
  }
}
