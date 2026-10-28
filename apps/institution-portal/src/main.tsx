import { HttpOversightClient } from './oversight-client.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { HttpCaseworkClient } from './http-casework-client.js';
import { HttpIntegrationClient } from './http-integration-client.js';
import { HttpPortalClient, syntheticSessionToken } from './http-portal-client.js';
import { HttpPilotClient } from './http-pilot-client.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Application root is missing.');

const configuredGateway = import.meta.env['VITE_GATEWAY_URL'] as unknown;
const gateway = typeof configuredGateway === 'string' ? configuredGateway : '';
const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
const institutionToken = syntheticSessionToken(gateway, 'INSTITUTION_OPERATOR', browserFetch);
const verifierToken = syntheticSessionToken(gateway, 'AUTHORIZED_VERIFIER', browserFetch);
const reviewerToken = syntheticSessionToken(gateway, 'AICTE_REVIEWER', browserFetch);
const caseworkTokens = {
  AICTE_CHECKER: syntheticSessionToken(gateway, 'AICTE_CHECKER', browserFetch),
  AICTE_REVIEWER: syntheticSessionToken(gateway, 'AICTE_REVIEWER', browserFetch),
  INSTITUTION_OPERATOR: institutionToken,
} as const;

createRoot(root).render(
  <StrictMode>
    <App
      oversightClient={new HttpOversightClient(gateway, browserFetch)}
      client={
        new HttpPortalClient({ baseUrl: gateway, fetch: browserFetch, token: institutionToken })
      }
      caseworkClient={
        new HttpCaseworkClient({
          baseUrl: gateway,
          fetch: browserFetch,
          token: (role): Promise<string> => caseworkTokens[role](),
        })
      }
      integrationClient={
        new HttpIntegrationClient({
          baseUrl: gateway,
          fetch: browserFetch,
          providerToken: institutionToken,
          token: verifierToken,
        })
      }
      pilotClient={
        new HttpPilotClient({
          baseUrl: gateway,
          fetch: browserFetch,
          institutionToken,
          reviewerToken,
        })
      }
    />
  </StrictMode>,
);
