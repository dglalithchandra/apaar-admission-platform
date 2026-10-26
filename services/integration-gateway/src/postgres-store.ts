import type { Pool, PoolClient } from 'pg';
import type { ApprovalManifestRepository } from './approval-import.js';
import type {
  ApprovalImportManifest,
  ApprovalImportResult,
  NotificationDelivery,
  NotificationRepositoryPort,
  Principal,
  VerificationReceipt,
  VerificationReceiptPort,
} from './model.js';
import { GatewayProblem } from './model.js';

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresIntegrationStore
  implements ApprovalManifestRepository, NotificationRepositoryPort, VerificationReceiptPort
{
  public constructor(private readonly pool: Pool) {}

  public async findApproval(
    reference: string,
  ): Promise<{ readonly digest: string; readonly result: ApprovalImportResult } | null> {
    const approval = await this.pool.query<{
      digest_sha256: string;
      status: 'IMPORTED' | 'PROPOSED';
    }>('SELECT digest_sha256,status FROM integration_approval_imports WHERE id=$1', [reference]);
    if (approval.rows[0] === undefined) return null;
    return {
      digest: approval.rows[0].digest_sha256,
      result: { importReference: reference, replayed: false, status: approval.rows[0].status },
    };
  }

  public async find(
    reference: string,
  ): Promise<{ readonly hash: string; readonly receipt: VerificationReceipt } | null> {
    const receipt = await this.pool.query<{
      algorithm: string;
      claims: Record<string, string | boolean>;
      expires_at: string;
      issued_at: string;
      key_id: string;
      legal_basis_reference: string;
      purpose: string;
      request_hash: string;
      requester_organisation: string;
      signature: string;
      verification_reference: string;
      revoked: boolean;
    }>(
      `SELECT r.*,EXISTS(SELECT 1 FROM verification_receipt_revocations x
       WHERE x.verification_reference=r.verification_reference) AS revoked
       FROM verification_receipts r WHERE r.idempotency_key=$1`,
      [reference],
    );
    const row = receipt.rows[0];
    return row === undefined
      ? null
      : {
          hash: row.request_hash,
          receipt: {
            algorithm: row.algorithm,
            claims: row.claims,
            expiresAt: new Date(row.expires_at).toISOString(),
            issuedAt: new Date(row.issued_at).toISOString(),
            keyId: row.key_id,
            legalBasisReference: row.legal_basis_reference,
            purpose: row.purpose,
            requesterOrganisation: row.requester_organisation,
            signature: row.signature,
            status: row.revoked ? 'REVOKED' : 'ACTIVE',
            verificationReference: row.verification_reference,
          },
        };
  }

  public async save(
    idempotencyKey: string,
    requestHash: string,
    receipt: VerificationReceipt,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO verification_receipts(
            verification_reference,idempotency_key,request_hash,requester_organisation,purpose,
            legal_basis_reference,claims,issued_at,expires_at,key_id,algorithm,signature
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          receipt.verificationReference,
          idempotencyKey,
          requestHash,
          receipt.requesterOrganisation,
          receipt.purpose,
          receipt.legalBasisReference,
          receipt.claims,
          receipt.issuedAt,
          receipt.expiresAt,
          receipt.keyId,
          receipt.algorithm,
          receipt.signature,
        ],
      );
      await this.audit(
        client,
        receipt.verificationReference,
        'VERIFICATION_RECEIPT_CREATED',
        receipt.requesterOrganisation,
      );
    });
  }

  public async saveApproval(
    manifest: ApprovalImportManifest,
    result: ApprovalImportResult,
    principal: Principal,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const overlap = await client.query<{ id: string }>(
        `SELECT id FROM integration_approval_imports
         WHERE institution_id=$1 AND campus_id=$2 AND programme_id=$3 AND course_id=$4
           AND status='IMPORTED' AND superseded_by IS NULL
           AND daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') &&
               daterange($5::date,coalesce($6::date,'infinity'::date),'[]') FOR UPDATE`,
        [
          manifest.institutionId,
          manifest.campusId,
          manifest.programmeId,
          manifest.courseId,
          manifest.effectiveFrom,
          manifest.effectiveTo,
        ],
      );
      const overlappingReferences = overlap.rows.map((row) => row.id);
      const explicitlySupersedesOverlap =
        result.status === 'IMPORTED' &&
        manifest.supersedesImportReference !== null &&
        overlappingReferences.length === 1 &&
        overlappingReferences[0] === manifest.supersedesImportReference;
      if (overlap.rowCount !== 0 && result.status !== 'PROPOSED' && !explicitlySupersedesOverlap) {
        throw new GatewayProblem(
          'APPROVAL_IMPORT_OVERLAP',
          409,
          'An active authoritative import overlaps this range.',
        );
      }
      await client.query(
        `INSERT INTO integration_approval_imports(
          id,source_system,source_version,digest_sha256,authority,status,institution_id,campus_id,
          programme_id,course_id,effective_from,effective_to,payload,imported_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          manifest.importReference,
          manifest.sourceSystem,
          manifest.sourceVersion,
          manifest.digestSha256,
          manifest.authority,
          result.status,
          manifest.institutionId,
          manifest.campusId,
          manifest.programmeId,
          manifest.courseId,
          manifest.effectiveFrom,
          manifest.effectiveTo,
          manifest.payload,
          principal.actorReference,
        ],
      );
      if (explicitlySupersedesOverlap) {
        await client.query(
          `UPDATE integration_approval_imports SET superseded_by=$2
           WHERE id=$1 AND superseded_by IS NULL`,
          [manifest.supersedesImportReference, manifest.importReference],
        );
      }
      await this.audit(
        client,
        manifest.importReference,
        'APPROVAL_MANIFEST_IMPORTED',
        principal.actorReference,
      );
    });
  }

  public async enqueue(delivery: NotificationDelivery, availableAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO integration_notification_deliveries(
        id,destination_reference,message_code,state,attempt_count,available_at
      ) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
      [
        delivery.notificationId,
        delivery.destinationReference,
        delivery.messageCode,
        delivery.state,
        delivery.attemptCount,
        availableAt,
      ],
    );
  }

  public async claim(now: string): Promise<NotificationDelivery | null> {
    return transaction(this.pool, async (client) => {
      const claimed = await client.query<{
        attempt_count: number;
        destination_reference: string;
        id: string;
        message_code: string;
        state: NotificationDelivery['state'];
      }>(
        `SELECT id,destination_reference,message_code,state,attempt_count
         FROM integration_notification_deliveries
         WHERE state IN ('PENDING','RETRYABLE') AND available_at <= $1
         ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
        [now],
      );
      const row = claimed.rows[0];
      if (row === undefined) return null;
      const attempt = row.attempt_count + 1;
      await client.query(
        'UPDATE integration_notification_deliveries SET attempt_count=$2 WHERE id=$1',
        [row.id, attempt],
      );
      await client.query(
        `INSERT INTO integration_notification_attempts(notification_id,attempt_number,outcome)
         VALUES($1,$2,'CLAIMED')`,
        [row.id, attempt],
      );
      return {
        attemptCount: attempt,
        destinationReference: row.destination_reference,
        messageCode: row.message_code,
        notificationId: row.id,
        state: row.state,
      };
    });
  }

  public async complete(
    notificationId: string,
    outcome: 'DELIVERED' | 'RETRYABLE' | 'DEAD_LETTER',
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const current = await client.query<{ attempt_count: number }>(
        'SELECT attempt_count FROM integration_notification_deliveries WHERE id=$1 FOR UPDATE',
        [notificationId],
      );
      const attempt = current.rows[0]?.attempt_count;
      if (attempt === undefined)
        throw new GatewayProblem('NOTIFICATION_NOT_FOUND', 404, 'Notification not found.');
      await client.query(
        `UPDATE integration_notification_deliveries SET state=$2,
         delivered_at=CASE WHEN $2='DELIVERED' THEN transaction_timestamp() ELSE delivered_at END,
         available_at=CASE WHEN $2='RETRYABLE' THEN transaction_timestamp()+interval '30 seconds' ELSE available_at END
         WHERE id=$1`,
        [notificationId, outcome],
      );
      await client.query(
        `INSERT INTO integration_notification_attempts(notification_id,attempt_number,outcome)
         VALUES($1,$2,$3)`,
        [notificationId, attempt, outcome],
      );
    });
  }

  public async revoke(reference: string, reason: string, actor: string, at: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO verification_receipt_revocations(verification_reference,reason_code,actor_reference,revoked_at)
       VALUES($1,$2,$3,$4) ON CONFLICT(verification_reference) DO NOTHING`,
      [reference, reason, actor, at],
    );
  }

  private async audit(
    client: PoolClient,
    reference: string,
    event: string,
    actor: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_audit_events(
        id,event_type,aggregate_type,aggregate_reference,actor_reference,reason,
        correlation_reference,request_reference,details,created_at
      ) VALUES($1,$2,'INTEGRATION',$3,$4,'Stage 5 governed integration',$5,$6,'{}',transaction_timestamp())`,
      [
        `SYNTH-AUDIT-${reference}`,
        event,
        reference,
        actor,
        `SYNTH-CORRELATION-${reference}`,
        `SYNTH-REQUEST-${reference}`,
      ],
    );
    await client.query(
      `INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_reference,payload,created_at)
       VALUES($1,$2,'INTEGRATION',$3,$4,transaction_timestamp())`,
      [`SYNTH-OUTBOX-${reference}`, event, reference, { reference }],
    );
  }
}
