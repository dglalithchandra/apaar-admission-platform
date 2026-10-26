import type { AuthorizationPort } from './ports.js';

export class DeterministicAuthorizationSimulator implements AuthorizationPort {
  public authorize(
    actor: Parameters<AuthorizationPort['authorize']>[0],
    _action: string,
    institutionId: string,
  ): Promise<boolean> {
    const roleAllowed = actor.role !== 'AUDITOR' && actor.role !== 'SYSTEM_OPERATOR';
    const scopeAllowed = actor.institutionId === null || actor.institutionId === institutionId;
    return Promise.resolve(roleAllowed && scopeAllowed);
  }
}
