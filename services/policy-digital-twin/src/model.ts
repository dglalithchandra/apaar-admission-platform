import type {
  AdmissionCategory,
  AdmissionPolicyOutcome,
  ApprovalSnapshot,
  CapacityUsage,
  RuleCode,
  StudentAdmission,
} from '@apaar-platform/admission-domain';

export interface PolicyScenario {
  readonly reference: string;
  readonly name: string;
  readonly rationale: string;
  readonly proposedApproval: ApprovalSnapshot;
}

export interface SimulationCohort {
  readonly reference: string;
  readonly admissions: readonly StudentAdmission[];
}

export interface OutcomeTotals {
  readonly accepted: number;
  readonly manualReview: number;
  readonly rejected: number;
}

export interface CategoryImpact {
  readonly category: AdmissionCategory;
  readonly baselineAccepted: number;
  readonly proposedAccepted: number;
  readonly delta: number;
}

export interface OutcomeTransition {
  readonly studentKey: string;
  readonly category: AdmissionCategory;
  readonly baseline: AdmissionPolicyOutcome;
  readonly proposed: AdmissionPolicyOutcome;
  readonly explanation: string;
}

export interface RuleImpact {
  readonly ruleCode: RuleCode;
  readonly baselineCount: number;
  readonly proposedCount: number;
  readonly delta: number;
}

export interface SimulationResult {
  readonly initialUsage: CapacityUsage;
  readonly orderingSensitivity: {
    readonly baselineChangedStudents: number;
    readonly proposedChangedStudents: number;
    readonly reversedBaselineAccepted: number;
    readonly reversedProposedAccepted: number;
    readonly method: 'FORWARD_VERSUS_REVERSE_ONLY';
  };
  readonly simulationReference: string;
  readonly cohortReference: string;
  readonly scenarioReference: string;
  readonly rulesetVersion: string;
  readonly baselineApprovalSnapshotId: string;
  readonly proposedApprovalSnapshotId: string;
  readonly baseline: OutcomeTotals;
  readonly proposed: OutcomeTotals;
  readonly acceptedSeatDelta: number;
  readonly preventedExcessAdmissions: number;
  readonly categoryImpacts: readonly CategoryImpact[];
  readonly transitions: readonly OutcomeTransition[];
  readonly ruleImpacts: readonly RuleImpact[];
  readonly finalBaselineUsage: CapacityUsage;
  readonly finalProposedUsage: CapacityUsage;
  readonly safety: {
    readonly liveLedgerMutated: false;
    readonly usesSyntheticCohort: boolean;
    readonly decisionMode: 'ADVISORY_ONLY';
  };
}
