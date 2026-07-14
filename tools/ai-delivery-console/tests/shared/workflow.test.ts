import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../../shared/workflow';
import {
  areAllImplementationStepsApproved,
  createEmptyImplementationSteps,
  defaultBranchName,
  ensureImplementationSteps,
  implementationStepForAction,
  implementationSteps,
  isStageApplicableToType,
  nextImplementationStep,
  shouldSyncBranchName,
  statusLabels,
  workflowStagesForType
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

  it('按需求类型返回适用阶段', () => {
    expect(workflowStagesForType('REQUIREMENT')).toEqual(['PRD', 'TECH_DESIGN', 'IMPLEMENTATION', 'CODE_REVIEW', 'RETROSPECTIVE']);
    expect(workflowStagesForType('DEFECT')).toEqual(['TECH_DESIGN', 'IMPLEMENTATION', 'CODE_REVIEW', 'RETROSPECTIVE']);
    expect(isStageApplicableToType('PRD', 'DEFECT')).toBe(false);
    expect(isStageApplicableToType('TECH_DESIGN', 'DEFECT')).toBe(true);
    expect(statusLabels.SKIPPED).toBe('已跳过');
  });

  it('手动编辑为自定义分支后不再被自动联动覆盖', () => {
    expect(shouldSyncBranchName('custom/branch', 'feature/opp#172014', true)).toBe(false);
  });

  it('提供实施验证子步骤默认状态和动作归属', () => {
    const steps = createEmptyImplementationSteps();
    expect(implementationSteps).toEqual(['START_CHANGE', 'ARTIFACT_REVIEW', 'APPLY', 'CHANGE_INSPECTION']);
    expect(steps.START_CHANGE.status).toBe('DRAFT');
    expect(steps.ARTIFACT_REVIEW.status).toBe('NOT_STARTED');
    expect(steps.APPLY.status).toBe('NOT_STARTED');
    expect(implementationStepForAction('OPENSPEC_NEW_CHANGE')).toBe('START_CHANGE');
    expect(implementationStepForAction('OPENSPEC_FF')).toBe('ARTIFACT_REVIEW');
    expect(implementationStepForAction('OPENSPEC_APPLY')).toBe('APPLY');
    expect(implementationStepForAction('JUNIT_GENERATE')).toBeUndefined();
    expect(nextImplementationStep('START_CHANGE')).toBe('ARTIFACT_REVIEW');
    expect(nextImplementationStep('CHANGE_INSPECTION')).toBeUndefined();
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

  it('忽略旧 UNIT_TEST 状态并只返回新流程步骤', () => {
    const steps = ensureImplementationSteps({
      START_CHANGE: { status: 'APPROVED' },
      ARTIFACT_REVIEW: { status: 'APPROVED' },
      APPLY: { status: 'APPROVED' },
      CHANGE_INSPECTION: { status: 'APPROVED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'NOT_STARTED' }
    });

    expect(Object.keys(steps)).toEqual(['START_CHANGE', 'ARTIFACT_REVIEW', 'APPLY', 'CHANGE_INSPECTION']);
  });

  it('兼容缺少 OpenSpec 工件输入快照的旧 run', () => {
    const run: RunRecord = {
      id: 'run-legacy',
      requirementId: '172014',
      actionType: 'OPENSPEC_FF',
      stage: 'IMPLEMENTATION',
      implementationStep: 'ARTIFACT_REVIEW',
      status: 'SUCCEEDED',
      startedAt: '2026-07-14T10:00:00.000Z',
      params: {}
    };

    expect(run.openSpecArtifactInputSnapshot).toBeUndefined();
  });

  it('判定实施验证子步骤全部通过时只认可四个新流程步骤均为 APPROVED', () => {
    expect(areAllImplementationStepsApproved()).toBe(false);
    expect(
      areAllImplementationStepsApproved({
        START_CHANGE: { status: 'APPROVED' },
        ARTIFACT_REVIEW: { status: 'APPROVED' }
      })
    ).toBe(false);
    expect(
      areAllImplementationStepsApproved({
        START_CHANGE: { status: 'APPROVED' },
        ARTIFACT_REVIEW: { status: 'APPROVED' },
        APPLY: { status: 'APPROVED' },
        CHANGE_INSPECTION: { status: 'APPROVED' }
      })
    ).toBe(true);
    expect(
      areAllImplementationStepsApproved({
        START_CHANGE: { status: 'APPROVED' },
        ARTIFACT_REVIEW: { status: 'APPROVED' },
        APPLY: { status: 'APPROVED' },
        CHANGE_INSPECTION: { status: 'RISK_ACCEPTED' }
      })
    ).toBe(false);
  });
});
