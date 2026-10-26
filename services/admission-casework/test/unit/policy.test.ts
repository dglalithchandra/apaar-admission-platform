import { describe, expect, it } from 'vitest';
import { CASE_STATES, CASE_TYPES } from '../../src/model.js';
import type { ActorContext, CaseState, CorrectionField } from '../../src/model.js';
import {
  actionStateFinding,
  authorityFinding,
  canPerform,
  canWrite,
  checkerFinding,
  correctionImpact,
  transitionFinding,
} from '../../src/policy.js';

const checker: ActorContext = {
  actorReference: 'SYNTH-CHECKER-0001',
  correlationReference: 'SYNTH-CORRELATION-0001',
  institutionId: null,
  purpose: 'SYNTHETIC_CASE_DECISION',
  reason: 'SYNTHETIC_REVIEW',
  requestReference: 'SYNTH-REQUEST-0001',
  role: 'AICTE_CHECKER',
};

describe('casework policy', () => {
  it('publishes the complete stable case type and lifecycle vocabularies', () => {
    expect(CASE_TYPES).toHaveLength(10);
    expect(CASE_STATES).toHaveLength(10);
  });
  it.each([
    ['DRAFT', 'SUBMITTED'],
    ['DRAFT', 'WITHDRAWN'],
    ['SUBMITTED', 'UNDER_REVIEW'],
    ['SUBMITTED', 'WITHDRAWN'],
    ['UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED'],
    ['UNDER_REVIEW', 'RECOMMENDED'],
    ['UNDER_REVIEW', 'REJECTED'],
    ['MORE_INFORMATION_REQUIRED', 'SUBMITTED'],
    ['MORE_INFORMATION_REQUIRED', 'WITHDRAWN'],
    ['RECOMMENDED', 'APPROVED'],
    ['RECOMMENDED', 'REJECTED'],
    ['APPROVED', 'IMPLEMENTED'],
    ['APPROVED', 'IMPLEMENTATION_FAILED'],
  ] as const)('allows %s to %s', (current, next) => {
    expect(transitionFinding(current, next)).toBeNull();
  });

  it.each(['REJECTED', 'WITHDRAWN', 'IMPLEMENTED', 'IMPLEMENTATION_FAILED'] as const)(
    'makes %s terminal',
    (current) => {
      expect(transitionFinding(current, 'DRAFT')).toMatchObject({
        code: 'CASE_TRANSITION_INVALID',
      });
    },
  );

  it('rejects a lifecycle shortcut', () => {
    expect(transitionFinding('DRAFT', 'APPROVED')).toMatchObject({
      code: 'CASE_TRANSITION_INVALID',
    });
  });

  it.each([
    ['STUDENT_REFERENCE', false, false, false],
    ['ACADEMIC_IDENTITY_REFERENCE', false, true, true],
    ['CATEGORY', true, false, true],
    ['STUDENT_STATUS', true, true, true],
    ['PROGRAMME_ID', true, false, true],
    ['COURSE_ID', true, false, true],
    ['ADMISSION_DATE', false, false, true],
    ['ELIGIBILITY_EVIDENCE', false, false, true],
  ] as const)(
    'classifies %s correction impact',
    (field, capacityMayChange, identityReverificationRequired, policyReevaluationRequired) => {
      expect(correctionImpact(field satisfies CorrectionField)).toEqual({
        capacityMayChange,
        identityReverificationRequired,
        makerCheckerRequired: true,
        policyReevaluationRequired,
      });
    },
  );

  it('rejects unsupported correction fields', () => {
    expect(correctionImpact('UNSUPPORTED')).toBeNull();
  });

  it('blocks proposed and unknown policy while allowing activated authority', () => {
    expect(authorityFinding('SOURCE_CONFIRMED')).toBeNull();
    expect(authorityFinding('AUTHORITY_CONFIGURED')).toBeNull();
    expect(authorityFinding('PROPOSED')).toMatchObject({ code: 'POLICY_AUTHORITY_REQUIRED' });
    expect(authorityFinding('UNKNOWN_BLOCKING')).toMatchObject({
      code: 'POLICY_AUTHORITY_REQUIRED',
    });
  });

  it('enforces independent authorised checker decisions', () => {
    expect(checkerFinding('SYNTH-MAKER-0001', checker)).toBeNull();
    expect(checkerFinding('SYNTH-CHECKER-0001', checker)).toMatchObject({
      code: 'CHECKER_MUST_DIFFER_FROM_MAKER',
    });
    expect(
      checkerFinding('SYNTH-MAKER-0001', { ...checker, role: 'AICTE_REVIEWER' }),
    ).toMatchObject({ code: 'ACTION_FORBIDDEN' });
  });

  it('keeps auditors and system operators read-only', () => {
    expect(canWrite('AUDITOR')).toBe(false);
    expect(canWrite('SYSTEM_OPERATOR')).toBe(false);
    expect(canWrite('INSTITUTION_OPERATOR')).toBe(true);
    expect(canWrite('AICTE_REVIEWER')).toBe(true);
  });

  it('enforces action-specific role and lifecycle boundaries', () => {
    expect(canPerform('INSTITUTION_OPERATOR', 'SUBMIT')).toBe(true);
    expect(canPerform('AICTE_REVIEWER', 'SUBMIT')).toBe(false);
    expect(canPerform('AICTE_REVIEWER', 'RECOMMEND')).toBe(true);
    expect(canPerform('AICTE_CHECKER', 'DECIDE')).toBe(true);
    expect(actionStateFinding('SUBMIT', 'DRAFT')).toBeNull();
    expect(actionStateFinding('SUBMIT', 'APPROVED')).toMatchObject({
      code: 'CASE_TRANSITION_INVALID',
    });
  });

  it('covers every state in the transition table', () => {
    const states: readonly CaseState[] = [
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'MORE_INFORMATION_REQUIRED',
      'RECOMMENDED',
      'APPROVED',
      'REJECTED',
      'WITHDRAWN',
      'IMPLEMENTED',
      'IMPLEMENTATION_FAILED',
    ];
    expect(
      states.every((state) => transitionFinding(state, state)?.code === 'CASE_TRANSITION_INVALID'),
    ).toBe(true);
  });
});
