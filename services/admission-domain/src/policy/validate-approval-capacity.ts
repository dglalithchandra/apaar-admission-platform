import type { ApprovalSnapshot } from '../model/entities.js';
import type { ValidationFinding } from '../model/validation.js';

export const HANDBOOK_SOURCE = {
  reference: 'AICTE-APH-2024-27',
  url: 'https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf',
  academicYears: ['2024-25', '2025-26', '2026-27'],
  pages: { nri: 34, fnOciGulf: 35, lateral: 70, foreignAcrossRoutes: 71, tfw: 75, pmUspy: 76 },
} as const;

export interface HypotheticalCapacityPolicy {
  readonly reference: string;
  readonly rationale: string;
  readonly nriPercent: number;
  readonly tfwPercent: number;
}

/** Source ceilings are independent of the absolute quantities received from an importer. */
export function validateApprovalCapacity(
  approval: ApprovalSnapshot,
  hypothetical?: HypotheticalCapacityPolicy,
): readonly ValidationFinding[] {
  if (
    hypothetical &&
    (!hypothetical.reference.trim() ||
      !hypothetical.rationale.trim() ||
      ![hypothetical.nriPercent, hypothetical.tfwPercent].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 100,
      ))
  ) {
    throw new TypeError(
      'A hypothetical amendment requires a reference, rationale and bounded percentage limits.',
    );
  }
  const findings: ValidationFinding[] = [];
  const invalid = (message: string): void => {
    findings.push({
      code: 'APPROVAL_CONFIGURATION_INVALID',
      severity: 'ERROR',
      authority: hypothetical ? 'PROPOSED' : 'SOURCE_CONFIRMED',
      message,
    });
  };
  const review = (message: string): void => {
    findings.push({
      code: 'APPROVAL_POLICY_UNRESOLVED',
      severity: 'REVIEW',
      authority: 'UNKNOWN_BLOCKING',
      message,
    });
  };
  const capacities = [
    approval.ordinaryIntake,
    approval.nri.maximumWithinOrdinary,
    approval.tfw.capacity,
    approval.fnOciGulf.combinedTotalCapacity,
    approval.fnOciGulf.foreignAndOciCapacity,
    approval.fnOciGulf.gulfCapacity,
    approval.fnOciGulf.foreignNationalAcrossRoutesMaximum,
    approval.lateral.supernumeraryCapacity,
    approval.lateral.firstYearVacancyCapacity,
    approval.pmUspy.courseCapacity,
    approval.pmUspy.institutionCapacity,
  ];
  if (capacities.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    invalid('All configured capacities must be non-negative safe whole numbers.');
    return findings;
  }
  if (
    approval.nri.maximumWithinOrdinary > approval.ordinaryIntake ||
    approval.fnOciGulf.foreignAndOciCapacity + approval.fnOciGulf.gulfCapacity >
      approval.fnOciGulf.combinedTotalCapacity
  ) {
    invalid('Capacity sublimits cannot exceed their parent bucket.');
  }
  if (
    !approval.sourceSystem.trim() ||
    !approval.sourceRecordId.trim() ||
    !approval.sourceHash.trim() ||
    !approval.approvedBy.trim() ||
    !approval.policyVersion.trim() ||
    !approval.importBatchReference.trim()
  ) {
    review('Approval provenance and accountable authority references must be recorded.');
  }
  if (approval.effectiveTo !== null && approval.effectiveTo < approval.effectiveFrom) {
    invalid('Approval effective dates are inverted.');
  }
  const n = approval.ordinaryIntake;
  if (!HANDBOOK_SOURCE.academicYears.some((year) => year === approval.academicYear)) {
    review('The supplied academic year is outside the sourced handbook period.');
  }
  const ceiling = (quantity: number, percent: number, label: string): void => {
    const exact = (n * percent) / 100;
    if (!Number.isInteger(exact)) {
      review(
        label +
          ': the percentage ceiling is fractional; an accountable rounding policy is required.',
      );
    } else if (quantity > exact) {
      invalid(label + ' exceeds the handbook ceiling of ' + String(exact) + ' seats.');
    }
  };
  if (approval.nri.approved)
    ceiling(
      approval.nri.maximumWithinOrdinary,
      hypothetical?.nriPercent ?? 5,
      'NRI within Approved Intake',
    );
  if (approval.tfw.approved)
    ceiling(approval.tfw.capacity, hypothetical?.tfwPercent ?? 5, 'TFW supernumerary capacity');
  if (approval.fnOciGulf.approved || approval.lateral.approved) {
    ceiling(
      approval.fnOciGulf.foreignNationalAcrossRoutesMaximum,
      15,
      'Foreign nationals across routes',
    );
  }
  if (approval.fnOciGulf.approved) {
    ceiling(approval.fnOciGulf.combinedTotalCapacity, 15, 'FN/OCI/Gulf combined capacity');

    const third = approval.fnOciGulf.combinedTotalCapacity / 3;
    if (!Number.isInteger(third))
      review('Gulf subgroup allocation is fractional; accountable allocation policy is required.');
    else if (
      approval.fnOciGulf.gulfCapacity !== third ||
      approval.fnOciGulf.foreignAndOciCapacity !== third * 2
    ) {
      review(
        'FN/OCI and Gulf allocations differ from the sourced two-thirds/one-third split; a dated authorized transfer is required.',
      );
    }
  }
  if (approval.lateral.approved) {
    ceiling(approval.lateral.supernumeraryCapacity, 10, 'Lateral supernumerary capacity');
    if (approval.lateral.firstYearVacancyCapacity > n) {
      review(
        'First-year vacancies exceed this snapshot intake; originating-year approval and vacancy evidence require accountable review.',
      );
    }
  }
  if (
    approval.pmUspy.courseCapacity > 2 ||
    approval.pmUspy.institutionCapacity > 10 ||
    approval.pmUspy.courseCapacity > approval.pmUspy.institutionCapacity
  ) {
    invalid('PM-USPY is limited to two seats per course and ten per institution.');
  }
  return findings;
}

export function assertImportableApproval(approval: ApprovalSnapshot): void {
  const findings = validateApprovalCapacity(approval);
  if (findings.length)
    throw new TypeError(findings.map((item) => item.code + ': ' + item.message).join(' '));
}
