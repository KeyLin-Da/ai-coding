import { describe, expect, it } from 'vitest';
import { findFirstPendingImplementationStep } from '../shared/workflow';

describe('step-auto-navigation', () => {
  it('全部未审核时返回 START_CHANGE', () => {
    const states = {
      START_CHANGE: { step: 'START_CHANGE', status: 'DRAFT' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'NOT_STARTED' },
      APPLY: { step: 'APPLY', status: 'NOT_STARTED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'NOT_STARTED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'NOT_STARTED' }
    };
    expect(findFirstPendingImplementationStep(states)).toBe('START_CHANGE');
  });

  it('START_CHANGE APPROVED 时返回 ARTIFACT_REVIEW', () => {
    const states = {
      START_CHANGE: { step: 'START_CHANGE', status: 'APPROVED' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'DRAFT' },
      APPLY: { step: 'APPLY', status: 'NOT_STARTED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'NOT_STARTED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'NOT_STARTED' }
    };
    expect(findFirstPendingImplementationStep(states)).toBe('ARTIFACT_REVIEW');
  });

  it('前三个步骤 APPROVED 时返回 CHANGE_INSPECTION', () => {
    const states = {
      START_CHANGE: { step: 'START_CHANGE', status: 'APPROVED' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'DRAFT' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'NOT_STARTED' }
    };
    expect(findFirstPendingImplementationStep(states)).toBe('CHANGE_INSPECTION');
  });

  it('所有步骤 APPROVED 时返回 UNIT_TEST', () => {
    const states = {
      START_CHANGE: { step: 'START_CHANGE', status: 'APPROVED' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'APPROVED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'APPROVED' }
    };
    expect(findFirstPendingImplementationStep(states)).toBe('UNIT_TEST');
  });
});
