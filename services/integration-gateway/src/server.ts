import { readDatabaseConfig } from '@apaar-platform/admission-application';
import { loadGatewayConfig } from './config.js';
import { GatewayHttpApplication } from './http.js';
import { GatewayProblem } from './model.js';
import { createReferenceRuntime } from './reference-runtime.js';
import { createReferencePool, runReferenceMigrations } from './reference-persistence.js';

const config = loadGatewayConfig(process.env);
if (!config.syntheticAuthentication) {
  throw new GatewayProblem(
    'EXTERNAL_IDENTITY_PROVIDER_UNAVAILABLE',
    500,
    'An approved OIDC verifier must be configured when synthetic authentication is disabled.',
  );
}

const pool = createReferencePool(readDatabaseConfig(process.env));
const applied = await runReferenceMigrations(pool);
const runtime = createReferenceRuntime(pool, config);
const application = new GatewayHttpApplication(runtime.dependencies, {
  allowedOrigins: config.allowedOrigins,
  host: config.host,
  maximumJsonBytes: config.maximumJsonBytes,
  maximumUploadBytes: config.maximumUploadBytes,
  port: config.port,
  requestTimeoutMs: config.requestTimeoutMs,
  requestsPerMinute: config.requestsPerMinute,
});

const port = await application.start();
process.stdout.write(
  `integration-gateway listening on ${config.host}:${String(port)} (${config.environment}); migrations=${applied.join(',') || 'current'}\n`,
);

let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await application.stop();
  await pool.end();
  process.exitCode = 0;
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
