import {
  ADMISSION_RULESET_VERSION,
  validateApprovalCapacity,
  HANDBOOK_SOURCE,
  type HypotheticalCapacityPolicy,
  emptyCapacityUsage,
  evaluateAdmissionPolicy,
  type AdmissionCategory,
  type AdmissionPolicyDecision,
  type ApprovalSnapshot,
  type CapacityReservation,
  type CapacityUsage,
  type RuleCode,
  type StudentAdmission,
} from '@apaar-platform/admission-domain';
import type {
  CategoryImpact,
  OutcomeTotals,
  PolicyScenario,
  RuleImpact,
  SimulationCohort,
  SimulationResult,
} from './model.js';

interface RunDecision {
  readonly admission: StudentAdmission;
  readonly decision: AdmissionPolicyDecision;
}

interface RunResult {
  readonly decisions: readonly RunDecision[];
  readonly usage: CapacityUsage;
}

const CATEGORIES: readonly AdmissionCategory[] = [
  'ORDINARY',
  'NRI',
  'FOREIGN_NATIONAL',
  'OCI',
  'GULF_WORKER_CHILD',
  'LATERAL_ENTRY',
  'TFW',
  'PM_USPY',
  'OTHER_SUPERNUMERARY',
];

function incrementUsage(
  usage: CapacityUsage,
  reservation: CapacityReservation,
  admission: StudentAdmission,
): CapacityUsage {
  const next = { ...usage };
  switch (reservation.bucket) {
    case 'ORDINARY':
      next.ordinaryUsed += 1;
      if (reservation.subcategory === 'NRI') next.nriWithinOrdinaryUsed += 1;
      break;
    case 'FN_OCI_SUPERNUMERARY':
      next.foreignAndOciUsed += 1;
      if (reservation.subcategory === 'FOREIGN_NATIONAL') {
        next.foreignNationalAcrossRoutesUsed += 1;
      }
      break;
    case 'GULF_WORKER_CHILD_SUPERNUMERARY':
      next.gulfUsed += 1;
      break;
    case 'LATERAL_SUPERNUMERARY':
      next.lateralSupernumeraryUsed += 1;
      if (admission.studentStatus.foreignNational) next.foreignNationalAcrossRoutesUsed += 1;
      break;
    case 'LATERAL_FIRST_YEAR_VACANCY':
      next.lateralFirstYearVacancyUsed += 1;
      if (admission.studentStatus.foreignNational) next.foreignNationalAcrossRoutesUsed += 1;
      break;
    case 'TFW_SUPERNUMERARY':
      next.tfwUsed += 1;
      break;
    case 'PM_USPY_SUPERNUMERARY':
      next.pmUspyCourseUsed += 1;
      next.pmUspyInstitutionUsed += 1;
      break;
  }
  return next;
}

function run(
  approval: ApprovalSnapshot,
  admissions: readonly StudentAdmission[],
  initialUsage: CapacityUsage,
  amendment?: HypotheticalCapacityPolicy,
): RunResult {
  let usage = { ...initialUsage };
  const decisions: RunDecision[] = [];
  for (const admission of admissions) {
    const decision = evaluateAdmissionPolicy({
      admission,
      approval,
      evaluatedAt: admission.identityVerification.checkedAt,
      usage,
      ...(amendment ? { hypotheticalCapacityPolicy: amendment } : {}),
    });
    decisions.push({ admission, decision });
    if (decision.reservation !== null) {
      usage = incrementUsage(usage, decision.reservation, admission);
    }
  }
  return { decisions, usage };
}

function totals(runResult: RunResult): OutcomeTotals {
  return {
    accepted: runResult.decisions.filter(({ decision }) => decision.outcome === 'ACCEPT').length,
    manualReview: runResult.decisions.filter(({ decision }) => decision.outcome === 'MANUAL_REVIEW')
      .length,
    rejected: runResult.decisions.filter(({ decision }) => decision.outcome === 'REJECT').length,
  };
}

function acceptedFor(runResult: RunResult, category: AdmissionCategory): number {
  return runResult.decisions.filter(
    ({ admission, decision }) => admission.category === category && decision.outcome === 'ACCEPT',
  ).length;
}

function categoryImpacts(baseline: RunResult, proposed: RunResult): readonly CategoryImpact[] {
  return CATEGORIES.map((category) => {
    const baselineAccepted = acceptedFor(baseline, category);
    const proposedAccepted = acceptedFor(proposed, category);
    return {
      baselineAccepted,
      category,
      delta: proposedAccepted - baselineAccepted,
      proposedAccepted,
    };
  }).filter(
    ({ baselineAccepted, proposedAccepted }) => baselineAccepted > 0 || proposedAccepted > 0,
  );
}

function ruleCounts(runResult: RunResult): ReadonlyMap<RuleCode, number> {
  const counts = new Map<RuleCode, number>();
  for (const { decision } of runResult.decisions) {
    for (const finding of decision.findings) {
      if (finding.severity === 'INFO') continue;
      counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
    }
  }
  return counts;
}

function ruleImpacts(baseline: RunResult, proposed: RunResult): readonly RuleImpact[] {
  const before = ruleCounts(baseline);
  const after = ruleCounts(proposed);
  const codes = new Set([...before.keys(), ...after.keys()]);
  return [...codes]
    .map((ruleCode) => ({
      baselineCount: before.get(ruleCode) ?? 0,
      delta: (after.get(ruleCode) ?? 0) - (before.get(ruleCode) ?? 0),
      proposedCount: after.get(ruleCode) ?? 0,
      ruleCode,
    }))
    .filter(({ delta }) => delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
}

function explanation(decision: AdmissionPolicyDecision): string {
  const blockers = decision.findings.filter(({ severity }) => severity !== 'INFO');
  return blockers.length
    ? blockers.map((f) => `${f.code}: ${f.message}`).join(' ')
    : `${decision.outcome}: reserves ${String(decision.reservation === null ? 0 : 1)} seat in ${decision.reservation?.bucket ?? 'no bucket'} under this scenario's recorded capacities; this is not an authorization.`;
}

function capacityRejections(runResult: RunResult): number {
  return runResult.decisions.filter(
    ({ decision }) =>
      decision.outcome === 'REJECT' &&
      decision.findings.some(({ code }) => code.includes('CAPACITY_EXCEEDED')),
  ).length;
}

export function simulatePolicyScenario(input: {
  readonly baselineApproval: ApprovalSnapshot;
  readonly cohort: SimulationCohort;
  readonly scenario: PolicyScenario;
  readonly initialUsage?: CapacityUsage;
}): SimulationResult {
  const status = input.scenario.kind ?? 'CURRENT_RULE_CONFIGURATION';
  if ((status === 'HYPOTHETICAL_AMENDMENT') !== (input.scenario.amendment !== undefined))
    throw new TypeError('An amendment must be explicitly declared with its proposed rule context.');
  const initialUsage = input.initialUsage ?? emptyCapacityUsage();
  if (Object.values(initialUsage).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('Initial occupied capacity must contain non-negative whole numbers.');
  }
  const keys = new Set<string>();
  for (const admission of input.cohort.admissions) {
    if (keys.has(admission.studentKey))
      throw new TypeError(
        'Resolve repeated student identities before simulating this single-course cohort.',
      );
    keys.add(admission.studentKey);
  }
  const baseline = run(input.baselineApproval, input.cohort.admissions, initialUsage);
  const proposed = run(
    input.scenario.proposedApproval,
    input.cohort.admissions,
    initialUsage,
    input.scenario.amendment,
  );
  const reversed = [...input.cohort.admissions].reverse();
  const reverseBaseline = run(input.baselineApproval, reversed, initialUsage);
  const reverseProposed = run(
    input.scenario.proposedApproval,
    reversed,
    initialUsage,
    input.scenario.amendment,
  );
  const changes = (forward: RunResult, backward: RunResult): number => {
    const outcomes = new Map(
      backward.decisions.map((item) => [item.admission.studentKey, item.decision.outcome]),
    );
    return forward.decisions.filter(
      (item) => outcomes.get(item.admission.studentKey) !== item.decision.outcome,
    ).length;
  };
  const baselineTotals = totals(baseline);
  const proposedTotals = totals(proposed);
  const transitions = baseline.decisions.flatMap((item, index) => {
    const changed = proposed.decisions[index];
    if (changed === undefined || item.decision.outcome === changed.decision.outcome) return [];
    return [
      {
        baseline: item.decision.outcome,
        category: item.admission.category,
        explanation:
          'Before: ' + explanation(item.decision) + ' After: ' + explanation(changed.decision),
        baselineRuleCodes: item.decision.findings.map((f) => f.code),
        proposedRuleCodes: changed.decision.findings.map((f) => f.code),
        proposed: changed.decision.outcome,
        studentKey: item.admission.studentKey,
      },
    ];
  });

  return {
    proposalStatus: status,
    reproduction: structuredClone({
      ...input,
      initialUsage,
      source: HANDBOOK_SOURCE,
      rulesetVersion: ADMISSION_RULESET_VERSION,
    }),
    baselineConfigurationFindings: validateApprovalCapacity(input.baselineApproval),
    proposedConfigurationFindings: validateApprovalCapacity(
      input.scenario.proposedApproval,
      input.scenario.amendment,
    ),
    initialUsage: { ...initialUsage },
    orderingSensitivity: {
      baselineChangedStudents: changes(baseline, reverseBaseline),
      proposedChangedStudents: changes(proposed, reverseProposed),
      reversedBaselineAccepted: totals(reverseBaseline).accepted,
      reversedProposedAccepted: totals(reverseProposed).accepted,
      method: 'FORWARD_VERSUS_REVERSE_ONLY',
    },
    acceptedSeatDelta: proposedTotals.accepted - baselineTotals.accepted,
    baseline: baselineTotals,
    baselineApprovalSnapshotId: input.baselineApproval.id,
    categoryImpacts: categoryImpacts(baseline, proposed),
    cohortReference: input.cohort.reference,
    finalBaselineUsage: baseline.usage,
    finalProposedUsage: proposed.usage,
    preventedExcessAdmissions: capacityRejections(proposed),
    proposed: proposedTotals,
    proposedApprovalSnapshotId: input.scenario.proposedApproval.id,
    ruleImpacts: ruleImpacts(baseline, proposed),
    rulesetVersion: ADMISSION_RULESET_VERSION,
    safety: {
      decisionMode: 'ADVISORY_ONLY',
      liveLedgerMutated: false,
      usesSyntheticCohort: input.cohort.admissions.every(({ studentKey }) =>
        studentKey.startsWith('SYNTH-'),
      ),
    },
    scenarioReference: input.scenario.reference,
    simulationReference: `SIM-${input.cohort.reference}-${input.scenario.reference}`,
    transitions,
  };
}
