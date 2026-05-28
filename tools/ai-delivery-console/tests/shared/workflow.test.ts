import { describe, expect, it } from 'vitest';
import {
  createEmptyImplementationSteps,
  defaultBranchName,
  ensureImplementationSteps,
  implementationStepForAction,
  implementationSteps,
  nextImplementationStep,
  shouldSyncBranchName
} from '../../shared/workflow';

describe('workflow helpers', () => {
  it('按需求类型生成默认分支名', () => {
    expect(defaultBranchName('172014', 'REQUIREMENT')).toBe('feature/opp#172014');
    expect(defaultBranchName('172014', 'DEFECT')).toBe('bugfix/opp#172014');
  });

  it('未手动编辑或仍等于旧自动值时继续联动分支名', () => {
    expect(shouldSyncBranchName('feature/opp#172014', 'feature/opp#172014', true)).toBe(true);
    expect(shouldSyncBranchName('', 'feature/opp#172014', true)).toBe(true);
    expect(shouldSyncBranchName('custom/branch', 'feature/opp#172014', false)).toBe(true);
  });

  it('手动编辑为自定义分支后不再被自动联动覆盖', () => {
    expect(shouldSyncBranchName('custom/branch', 'feature/opp#172014', true)).toBe(false);
  });

  it('提供实施验证子步骤默认状态和动作归属', () => {
    const steps = createEmptyImplementationSteps();
    expect(implementationSteps).toEqual(['START_CHANGE', 'ARTIFACT_REVIEW', 'APPLY', 'CHANGE_INSPECTION', 'UNIT_TEST']);
    expect(steps.START_CHANGE.status).toBe('DRAFT');
    expect(steps.ARTIFACT_REVIEW.status).toBe('NOT_STARTED');
    expect(steps.APPLY.status).toBe('NOT_STARTED');
    expect(implementationStepForAction('OPENSPEC_NEW_CHANGE')).toBe('START_CHANGE');
    expect(implementationStepForAction('OPENSPEC_FF')).toBe('ARTIFACT_REVIEW');
    expect(implementationStepForAction('OPENSPEC_APPLY')).toBe('APPLY');
    expect(implementationStepForAction('JUNIT_GENERATE')).toBe('UNIT_TEST');
    expect(nextImplementationStep('START_CHANGE')).toBe('ARTIFACT_REVIEW');
    expect(nextImplementationStep('CHANGE_INSPECTION')).toBe('UNIT_TEST');
  });

  it('兼容缺失部分实施子步骤的旧 workflow', () => {
    const steps = ensureImplementationSteps({
      ARTIFACT_REVIEW: { status: 'APPROVED', comment: '已通过' }
    });
    expect(steps.ARTIFACT_REVIEW.status).toBe('APPROVED');
    expect(steps.ARTIFACT_REVIEW.comment).toBe('已通过');
    expect(steps.START_CHANGE.status).toBe('DRAFT');
    expect(steps.APPLY.status).toBe('NOT_STARTED');
  });
});
