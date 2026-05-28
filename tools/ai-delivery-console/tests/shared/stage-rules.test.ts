import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages, implementationStepForAction, stageForAction } from '../../shared/workflow';
import { canApproveStage, canEnterStage, deriveCurrentStage, nextStage } from '../../shared/stage-rules';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '测试需求',
    sources: [],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('stage-rules', () => {
  it('按固定顺序推进阶段', () => {
    expect(nextStage('PRD')).toBe('TECH_DESIGN');
    expect(nextStage('CODE_REVIEW')).toBe('DONE');
  });

  it('PRD 未通过时禁止进入技术方案', () => {
    const item = workflow();
    expect(canEnterStage(item, 'TECH_DESIGN')).toBe(false);
    item.stages.PRD.status = 'APPROVED';
    expect(canEnterStage(item, 'TECH_DESIGN')).toBe(true);
  });

  it('代码评审存在未修复阻断问题时不可通过', () => {
    const item = workflow();
    item.stages.PRD.status = 'APPROVED';
    item.stages.TECH_DESIGN.status = 'APPROVED';
    item.stages.IMPLEMENTATION.status = 'APPROVED';
    item.issues.push({ id: 'IS-001', stage: 'CODE_REVIEW', severity: 'BLOCKER', title: '阻断问题', status: 'OPEN' });
    expect(canApproveStage(item, 'CODE_REVIEW')).toBe(false);
  });

  it('可从阶段状态推导当前阶段', () => {
    const item = workflow();
    item.stages.PRD.status = 'APPROVED';
    expect(deriveCurrentStage(item)).toBe('TECH_DESIGN');
  });

  it('按动作归属独立步骤日志', () => {
    expect(stageForAction('PRD_ANALYZE')).toBe('PRD');
    expect(stageForAction('DESIGN_GENERATE')).toBe('TECH_DESIGN');
    expect(stageForAction('OPENSPEC_VERIFY')).toBe('IMPLEMENTATION');
    expect(stageForAction('JUNIT_GENERATE')).toBe('IMPLEMENTATION');
    expect(stageForAction('CODE_REVIEW')).toBe('CODE_REVIEW');
    expect(stageForAction('OPENSPEC_ARCHIVE')).toBe('CODE_REVIEW');
    expect(stageForAction('RETURN_TO_IMPLEMENTATION')).toBe('CODE_REVIEW');
    expect(stageForAction('REFRESH_ARTIFACTS')).toBeUndefined();
  });

  it('按动作归属实施验证子步骤', () => {
    expect(implementationStepForAction('OPENSPEC_NEW_CHANGE')).toBe('START_CHANGE');
    expect(implementationStepForAction('OPENSPEC_FF')).toBe('ARTIFACT_REVIEW');
    expect(implementationStepForAction('OPENSPEC_APPLY')).toBe('APPLY');
    expect(implementationStepForAction('OPENSPEC_VERIFY')).toBe('APPLY');
    expect(implementationStepForAction('JUNIT_GENERATE')).toBe('UNIT_TEST');
    expect(implementationStepForAction('CODE_REVIEW')).toBeUndefined();
  });
});
