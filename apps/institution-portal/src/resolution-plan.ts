import type { PortalFinding } from './types.js';

export interface ResolutionStep {
  readonly code: string;
  readonly field: string | null;
  readonly originalFinding: string;
  readonly owner: 'INSTITUTION_OPERATOR' | 'AUTHORIZED_REVIEWER' | 'SERVICE_OPERATOR';
  readonly route: 'CORRECT_AND_RESUBMIT' | 'GOVERNED_REVIEW' | 'SERVICE_RECOVERY';
  readonly action: string;
  readonly requiredEvidence: string;
}

const capacityCodes = new Set([
  'ORDINARY_CAPACITY_EXCEEDED',
  'NRI_CAPACITY_EXCEEDED',
  'TFW_CAPACITY_EXCEEDED',
  'LATERAL_CAPACITY_EXCEEDED',
  'FN_OCI_GULF_CAPACITY_EXCEEDED',
  'FOREIGN_NATIONAL_COMBINED_CAPACITY_EXCEEDED',
  'PM_USPY_COURSE_CAPACITY_EXCEEDED',
  'PM_USPY_INSTITUTION_CAPACITY_EXCEEDED',
]);
const eligibilityCodes = new Set(['ELIGIBILITY_EVIDENCE_PENDING', 'ELIGIBILITY_EVIDENCE_REQUIRED']);
const conflictCodes = new Set(['STUDENT_ADMISSION_DUPLICATE', 'STUDENT_ENROLMENT_OVERLAP_REVIEW']);

/** Guidance from recorded findings, not a fresh policy decision or optimal repair solver. */
export function resolutionPlan(findings: readonly PortalFinding[]): readonly ResolutionStep[] {
  return findings
    .filter((f) => f.code !== 'IDENTITY_VERIFIED')
    .map((finding) => {
      const base = { code: finding.code, field: finding.field, originalFinding: finding.message };
      if (finding.code === 'FIELD_REQUIRED')
        return {
          ...base,
          owner: 'INSTITUTION_OPERATOR',
          route: 'CORRECT_AND_RESUBMIT',
          action: `Fill ${finding.field ?? 'the field named in the finding'} from the original institution record. Resubmit only the corrected failed row using the original template.`,
          requiredEvidence:
            'Original institution record supporting the missing value. Do not fabricate a value or change the academic identity to bypass a conflict.',
        };
      if (
        finding.code === 'IDENTITY_PROVIDER_UNAVAILABLE' ||
        finding.code === 'IDENTITY_PROVIDER_RETRYABLE'
      )
        return {
          ...base,
          owner: 'SERVICE_OPERATOR',
          route: 'SERVICE_RECOVERY',
          action:
            'Restore the identity provider and use the supported retry flow. Keep the original identity and request references.',
          requiredEvidence:
            'Provider recovery and a returned verification result. A timeout does not establish eligibility.',
        };
      if (capacityCodes.has(finding.code))
        return {
          ...base,
          owner: 'AUTHORIZED_REVIEWER',
          route: 'GOVERNED_REVIEW',
          action:
            'No automatic capacity repair is supported. Ask an authorized reviewer to reconcile recorded approval and current reservations. A recorded refusal cannot establish whether a seat is available now.',
          requiredEvidence:
            'Effective approval source and current capacity reconciliation. Do not increase intake, convert TFW seats, relabel categories or displace another student to make this row pass.',
        };
      if (eligibilityCodes.has(finding.code))
        return {
          ...base,
          owner: 'AUTHORIZED_REVIEWER',
          route: 'GOVERNED_REVIEW',
          action:
            'Obtain an accountable category-evidence review through an authorized process. Keep this constraint unresolved until that review returns.',
          requiredEvidence:
            'Evidence reference, reviewer, review time and method. CSV VERIFIED and a synthetic assessment do not establish real external verification.',
        };
      if (conflictCodes.has(finding.code))
        return {
          ...base,
          owner: 'AUTHORIZED_REVIEWER',
          route: 'GOVERNED_REVIEW',
          action:
            'Reconcile the existing admission or possible overlap through governed review. A match is not proof of fraud or unlawful dual enrolment.',
          requiredEvidence:
            'Authorized access to the relevant admission history and institution evidence. Do not generate a new identity or remove a record to bypass the finding.',
        };
      return {
        ...base,
        owner: 'AUTHORIZED_REVIEWER',
        route: 'GOVERNED_REVIEW',
        action:
          'This finding has no supported automatic correction. Obtain an accountable review using the recorded rule and source. Unknown rules remain unresolved.',
        requiredEvidence:
          'Recorded approval, original input and the authority needed to resolve this specific finding. Any later submission must pass current server validation.',
      };
    });
}
