import type { Pool } from 'pg';
import type {
  VerificationGrant,
  VerificationGrantRepository,
} from './verification-authorization.js';

export class PostgresVerificationGrantRepository implements VerificationGrantRepository {
  public constructor(private readonly pool: Pool) {}
  public async find(reference: string): Promise<VerificationGrant | null> {
    const result = await this.pool.query<{
      payload: Omit<VerificationGrant, 'revoked'>;
      revoked: boolean;
    }>(
      `SELECT g.payload, EXISTS(SELECT 1 FROM verification_grant_withdrawals w WHERE w.grant_reference=g.reference) AS revoked
       FROM verification_authorization_grants g WHERE g.reference=$1`,
      [reference],
    );
    const row = result.rows[0];
    return row === undefined ? null : { ...row.payload, revoked: row.revoked };
  }
}
