import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyImplementationSteps, createEmptyStages } from '../../shared/workflow';
import { applyReview, returnToImplementation } from '../../server/services/review-service';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages: {
      ...createEmptyStages(),
      PRD: { stage: 'PRD', status: 'APPROVED' },
      TECH_DESIGN: { stage: 'TECH_DESIGN', status: 'APPROVED' },
      IMPLEMENTATION: { stage: 'IMPLEMENTATION', status: 'DRAFT' }
    },
    implementationSteps: createEmptyImplementationSteps(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('review-service implementation steps', () => {
  it('审核通过实施子步骤时只推进内部步骤', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const result = await applyReview(root, workflow(), {
      requirementId: '172014',
      stage: 'IMPLEMENTATION',
      implementationStep: 'ARTIFACT_REVIEW',
      decision: 'APPROVED',
      comment: '工件可实施'
    });

    expect(result.currentStage).toBe('IMPLEMENTATION');
    expect(result.stages.IMPLEMENTATION.status).toBe('IN_PROGRESS');
    expect(result.implementationSteps?.ARTIFACT_REVIEW.status).toBe('APPROVED');
    expect(result.implementationSteps?.APPLY.status).toBe('DRAFT');
    expect(result.reviews[0].implementationStep).toBe('ARTIFACT_REVIEW');
  });

  it('单测子步骤审核通过后解锁代码评审', async () => {
    const item = workflow();
    item.implementationSteps = {
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'APPROVED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'DRAFT' }
    };
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const result = await applyReview(root, item, {
      requirementId: '172014',
      stage: 'IMPLEMENTATION',
      implementationStep: 'UNIT_TEST',
      decision: 'APPROVED',
      comment: '单测通过'
    });

    expect(result.currentStage).toBe('CODE_REVIEW');
    expect(result.stages.IMPLEMENTATION.status).toBe('APPROVED');
    expect(result.stages.CODE_REVIEW.status).toBe('DRAFT');
  });

  it('代码评审打回时回到开始实施子步骤', () => {
    const item = workflow();
    item.implementationSteps = {
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'APPROVED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'APPROVED' }
    };

    const result = returnToImplementation(item, [{ id: 'issue-1', stage: 'CODE_REVIEW', severity: 'BLOCKER', title: '阻断问题', status: 'OPEN' }]);

    expect(result.currentStage).toBe('IMPLEMENTATION');
    expect(result.implementationSteps?.ARTIFACT_REVIEW.status).toBe('APPROVED');
    expect(result.implementationSteps?.APPLY.status).toBe('DRAFT');
    expect(result.implementationSteps?.CHANGE_INSPECTION.status).toBe('NOT_STARTED');
    expect(result.implementationSteps?.UNIT_TEST.status).toBe('NOT_STARTED');
  });
});
