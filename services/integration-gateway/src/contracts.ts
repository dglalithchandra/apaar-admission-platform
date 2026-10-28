import type { ContractValidationPort, GatewayTransportResponse } from './model.js';
import { GatewayProblem } from './model.js';

const TEXT_RESPONSES = new Set([
  'exportOversightCapacity',
  'downloadAdmissionBatchCorrections',
  'downloadAdmissionBatchTemplate',
]);

export class StructuralContractValidator implements ContractValidationPort {
  public validateRequest(operationId: string, input: Readonly<Record<string, unknown>>): void {
    if (operationId.trim() === '' || Array.isArray(input)) {
      throw new GatewayProblem(
        'REQUEST_CONTRACT_VIOLATION',
        422,
        'The request does not match the operation contract.',
      );
    }
  }

  public validateResponse(operationId: string, response: GatewayTransportResponse): void {
    const expectsText = TEXT_RESPONSES.has(operationId);
    const expectsHtml = operationId === 'downloadPrintableAdmissionRecord';
    const validBody = expectsHtml
      ? typeof response.body === 'string' && response.contentType === 'text/html'
      : expectsText
        ? typeof response.body === 'string' && response.contentType === 'text/csv'
        : response.body !== undefined &&
          response.contentType !== 'text/csv' &&
          response.contentType !== 'text/html';
    if (!validBody || response.status < 200 || response.status >= 300) {
      throw new GatewayProblem(
        'RESPONSE_CONTRACT_VIOLATION',
        502,
        'A downstream service returned an invalid response.',
      );
    }
  }
}
