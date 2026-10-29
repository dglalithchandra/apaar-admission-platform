import { assertImportableApproval } from '@apaar-platform/admission-domain';
import { ADMISSION_VALIDATION_PROFILE_VERSION } from './model.js';
import {
  evaluateAdmissionPolicy,
  type AdmissionPolicyDecision,
  type ApprovalSnapshotQuery,
} from '@apaar-platform/admission-domain';
import type {
  ApprovalImportCommand,
  AdmissionSubmissionResult,
  ReferenceGenerator,
  SubmitAdmissionCommand,
} from './model.js';
import type { ApplicationDependencies, ApprovalSnapshotWriter } from './ports.js';

const SHA256 = /^[a-f0-9]{64}$/;

function validateCommand(command: SubmitAdmissionCommand): void {
  if (command.context.institutionId !== command.admission.institutionId) {
    throw new TypeError('The command institution must match the admission institution.');
  }
  if (command.context.idempotencyKey.length < 8 || command.context.idempotencyKey.length > 128) {
    throw new TypeError('The idempotency key must contain 8 to 128 characters.');
  }
  if (!SHA256.test(command.context.requestHash)) {
    throw new TypeError('The request hash must be a lowercase SHA-256 hexadecimal value.');
  }
  for (const [label, value] of Object.entries({
    actorReference: command.context.actorReference,
    reason: command.context.reason,
    correlationReference: command.context.correlationReference,
    requestReference: command.context.requestReference,
  })) {
    if (value.trim().length === 0) {
      throw new TypeError(`${label} must not be empty.`);
    }
  }
}

export class SubmitAdmissionService {
  public constructor(
    private readonly dependencies: ApplicationDependencies,
    private readonly references: ReferenceGenerator,
  ) {}

  public async execute(command: SubmitAdmissionCommand): Promise<AdmissionSubmissionResult> {
    validateCommand(command);
    const idempotencyRecordId = `IDEMP-${command.admission.commandId}`;

    return this.dependencies.unitOfWork.runIdempotent(
      {
        idempotencyKey: command.context.idempotencyKey,
        idempotencyRecordId,
        institutionId: command.context.institutionId,
        requestHash: command.context.requestHash,
      },
      async (transaction) => {
        const approvalQuery: ApprovalSnapshotQuery = {
          academicYear: command.admission.academicYear,
          admissionDate: command.admission.admissionDate,
          campusId: command.admission.campusId,
          courseId: command.admission.courseId,
          institutionId: command.admission.institutionId,
          programmeId: command.admission.programmeId,
        };
        const approval = await transaction.findEffective(approvalQuery);
        const usage =
          approval === null
            ? {
                foreignAndOciUsed: 0,
                foreignNationalAcrossRoutesUsed: 0,
                gulfUsed: 0,
                lateralFirstYearVacancyUsed: 0,
                lateralSupernumeraryUsed: 0,
                nriWithinOrdinaryUsed: 0,
                ordinaryUsed: 0,
                pmUspyCourseUsed: 0,
                pmUspyInstitutionUsed: 0,
                tfwUsed: 0,
              }
            : await transaction.loadCapacityUsageForUpdate(approval);
        const occurredAt = this.dependencies.clock.now();
        const conflict = await transaction.classifyStudentConflict(command.admission);
        const policyDecision = evaluateAdmissionPolicy({
          admission: command.admission,
          approval,
          evaluatedAt: occurredAt,
          usage,
        });
        const decision: AdmissionPolicyDecision =
          conflict === 'NONE'
            ? policyDecision
            : {
                ...policyDecision,
                outcome:
                  conflict === 'EXACT' || policyDecision.outcome === 'REJECT'
                    ? 'REJECT'
                    : 'MANUAL_REVIEW',
                targetLifecycleStatus:
                  conflict === 'EXACT' || policyDecision.outcome === 'REJECT'
                    ? 'REJECTED'
                    : 'UNDER_REVIEW',
                reservation: null,
                findings: [
                  ...policyDecision.findings,
                  {
                    code:
                      conflict === 'EXACT'
                        ? 'STUDENT_ADMISSION_DUPLICATE'
                        : 'STUDENT_ENROLMENT_OVERLAP_REVIEW',
                    severity: conflict === 'EXACT' ? 'ERROR' : 'REVIEW',
                    authority: conflict === 'EXACT' ? 'PROPOSED' : 'UNKNOWN_BLOCKING',
                    message:
                      conflict === 'EXACT'
                        ? 'An active admission already exists for this student, institution, course and academic year. No additional seat was reserved.'
                        : 'An active admission exists for this student in the same academic year. Authorised review must determine whether the programmes may overlap. No additional seat was reserved.',
                  },
                ],
              };
        const admissionId = this.references.next('ADMISSION');
        const decisionId = this.references.next('DECISION');
        const registrationReference =
          decision.outcome === 'ACCEPT' ? this.references.next('REGISTRATION') : null;
        const result: AdmissionSubmissionResult = {
          validationProfileVersion: ADMISSION_VALIDATION_PROFILE_VERSION,
          admissionId,
          admissionReference: registrationReference,
          decision,
          decisionId,
          replayed: false,
        };

        await transaction.persistOutcome({
          approval,
          command,
          decision,
          occurredAt,
          references: {
            admissionId,
            auditEventId: this.references.next('AUDIT'),
            decisionId,
            idempotencyRecordId,
            identityVerificationId: this.references.next('IDENTITY'),
            outboxEventId: this.references.next('OUTBOX'),
            registrationReference,
          },
        });
        return result;
      },
    );
  }
}

export class ImportApprovalSnapshotService {
  public constructor(private readonly writer: ApprovalSnapshotWriter) {}

  public async execute(command: ApprovalImportCommand): Promise<void> {
    if (
      (command.supersedesSnapshotId === undefined) !==
      (command.supersessionReason === undefined)
    ) {
      throw new TypeError('A superseded snapshot and reason must be supplied together.');
    }
    assertImportableApproval(command.snapshot);
    await this.writer.importSnapshot(command);
  }
}
