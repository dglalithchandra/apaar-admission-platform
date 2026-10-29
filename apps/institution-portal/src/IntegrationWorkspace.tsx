import { useState, type JSX } from 'react';
import type {
  IntegrationClient,
  IntegrationReadiness,
  IntegrationVerificationReceipt,
} from './integration-types.js';
import { IntegrationClientError } from './integration-types.js';

export function IntegrationWorkspace({
  client,
}: {
  readonly client: IntegrationClient;
}): JSX.Element {
  const [readiness, setReadiness] = useState<IntegrationReadiness | null>(null);
  const [receipt, setReceipt] = useState<IntegrationVerificationReceipt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ readonly code: string; readonly message: string } | null>(
    null,
  );

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError({
        code: cause instanceof IntegrationClientError ? cause.code : 'REQUEST_FAILED',
        message: cause instanceof Error ? cause.message : 'The gateway request failed.',
      });
    }
  }

  return (
    <div className="integration-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Synthetic integration assurance</p>
          <h1>Trust-boundary checks</h1>
          <p>
            Exercise honest authentication, provider-outage and verification-receipt states without
            contacting government or third-party services.
          </p>
        </div>
      </div>

      <div className="integration-warning" role="note">
        <strong>Local verification only</strong>
        <span>
          APAAR, SSO and notifications are simulated or disabled. Connected receipts use real
          Ed25519 signatures from an independent local issuer, not government issuance.
        </span>
      </div>

      {error !== null && (
        <div className="error-summary" role="alert">
          <strong>{error.code.toLowerCase().replaceAll('_', ' ')}</strong>
          <p>{error.message}</p>
        </div>
      )}
      {notice !== null && (
        <div className="success-summary" role="status">
          <strong>Check completed</strong>
          <p>{notice}</p>
        </div>
      )}

      <section className="panel integration-panel" aria-labelledby="integration-heading">
        <div className="section-heading">
          <div>
            <p className="step">Connection status</p>
            <h2 id="integration-heading">Gateway acceptance states</h2>
          </div>
        </div>
        {client.supportsPreviews === false && (
          <p>
            Verification uses the stored synthetic grant SYNTH-LEGAL-BASIS-001 for
            SYNTH-REGISTRATION-001, recipient SYNTH-VERIFIER-ORG and purpose
            SYNTH-PORTAL-ACCEPTANCE. It discloses only admission existence and current status. A
            withdrawn or expired grant blocks new receipts. Receipt revocation is a separate
            service-authorized action; refreshing below checks persisted receipt status. This screen
            does not create or withdraw grants.
          </p>
        )}
        <div className="integration-actions">
          <button
            className="button"
            onClick={() =>
              void run(async () => {
                const result = await client.readiness();
                setReadiness(result);
                setNotice('Readiness returned without exposing credentials or provider payloads.');
              })
            }
            type="button"
          >
            Check readiness
          </button>
          <button
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                await client.simulateProviderOutage();
                setNotice(
                  'Provider outage remains temporarily unavailable, never an invalid identity.',
                );
              })
            }
            type="button"
          >
            Preview provider outage
          </button>
          <button
            disabled={client.supportsPreviews === false}
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                await client.simulateAccess('UNAUTHENTICATED');
              })
            }
            type="button"
          >
            Preview unauthenticated
          </button>
          <button
            disabled={client.supportsPreviews === false}
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                await client.simulateAccess('FORBIDDEN');
              })
            }
            type="button"
          >
            Preview forbidden
          </button>
          <button
            className="button"
            onClick={() =>
              void run(async () => {
                setReceipt(await client.createSyntheticVerification());
                setNotice('A minimal synthetic receipt was created with an explicit expiry.');
              })
            }
            type="button"
          >
            Issue synthetic verification receipt
          </button>
          <button
            disabled={client.supportsPreviews === false}
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                const result = await client.simulateNotification('PENDING');
                setNotice(
                  `Notification delivery is ${result.state.toLowerCase()}; the regulatory decision remains committed.`,
                );
              })
            }
            type="button"
          >
            Preview notification pending
          </button>
          <button
            disabled={client.supportsPreviews === false}
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                const result = await client.simulateNotification('DEAD_LETTER');
                setNotice(
                  `Notification delivery is ${result.state.toLowerCase().replace('_', ' ')} and requires operational review.`,
                );
              })
            }
            type="button"
          >
            Preview notification failure
          </button>
          <button
            disabled={client.supportsPreviews === false}
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                setReceipt(await client.simulateReceiptStatus('EXPIRED'));
                setNotice('The synthetic receipt is expired and must not be accepted as current.');
              })
            }
            type="button"
          >
            Preview expired receipt
          </button>
          <button
            disabled={client.supportsPreviews === false}
            className="button button--secondary"
            onClick={() =>
              void run(async () => {
                setReceipt(await client.simulateReceiptStatus('REVOKED'));
                setNotice('The synthetic receipt is revoked and must not be accepted.');
              })
            }
            type="button"
          >
            Preview revoked receipt
          </button>
        </div>
      </section>

      {readiness !== null && (
        <section className="integration-grid" aria-label="Dependency readiness">
          {(['database', 'apaar', 'notifications'] as const).map((dependency) => (
            <article className="panel" key={dependency}>
              <span>{dependency}</span>
              <strong>{readiness[dependency]}</strong>
            </article>
          ))}
        </section>
      )}

      {receipt !== null && (
        <section className="implementation-receipt" aria-labelledby="verification-receipt-heading">
          <p className="step">Synthetic verification receipt</p>
          <h2 id="verification-receipt-heading">{receipt.verificationReference}</h2>
          {client.receiptStatus && (
            <button
              className="button button--secondary"
              onClick={() => {
                void run(async () => {
                  if (client.receiptStatus)
                    setReceipt(await client.receiptStatus(receipt.verificationReference));
                  setNotice('Receipt status reloaded from the service.');
                });
              }}
            >
              Refresh receipt status
            </button>
          )}
          <p>
            Purpose: {receipt.purpose ?? 'Not supplied by this adapter'} · Recipient:{' '}
            {receipt.requesterOrganisation ?? 'Not supplied by this adapter'}
          </p>
          <p>
            Authorization: {receipt.legalBasisReference ?? 'Not supplied by this adapter'}. Expiry
            is checked by the service; revocation can invalidate a receipt earlier.
          </p>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{receipt.status}</dd>
            </div>
            <div>
              <dt>Claims</dt>
              <dd>{Object.keys(receipt.claims).join(', ')}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{receipt.expiresAt}</dd>
            </div>
            <div>
              <dt>Signing boundary</dt>
              <dd>{receipt.algorithm}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
