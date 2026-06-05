import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyImplementationSteps, createEmptyStages } from '../../shared/workflow';
import { applyReview, refreshCodeReviewIssues, returnToImplementation } from '../../server/services/review-service';

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

async function writeReviewSummary(summaryPath: string, issueId: string) {
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(
    summaryPath,
    `# 汇总报告

### ❌ 严重问题 (1)

| ID | 工程 | 文件 | 问题 | 状态 |
|----|------|------|------|------|
| ${issueId} | opp-learn | FunActivityServiceImpl.java | 游标分页跳数据 | ❌ 未修复 |
`
  );
}

describe('review-service implementation steps', () => {
  it('缺陷技术方案审核通过后进入实施验证', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const item: RequirementWorkflow = {
      ...workflow(),
      requirementType: 'DEFECT',
      currentStage: 'TECH_DESIGN',
      status: 'IN_PROGRESS',
      stages: {
        ...createEmptyStages('DEFECT'),
        TECH_DESIGN: { stage: 'TECH_DESIGN', status: 'READY_FOR_REVIEW', artifactPath: 'docs/172014/technical-design/design_review.md' }
      }
    };

    const result = await applyReview(root, item, {
      requirementId: '172014',
      stage: 'TECH_DESIGN',
      decision: 'APPROVED',
      comment: '技术方案通过'
    });

    expect(result.currentStage).toBe('IMPLEMENTATION');
    expect(result.stages.TECH_DESIGN.status).toBe('APPROVED');
    expect(result.stages.IMPLEMENTATION.status).toBe('DRAFT');
  });

  it('开始变更审核通过后推进到工件评审子步骤', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const result = await applyReview(root, workflow(), {
      requirementId: '172014',
      stage: 'IMPLEMENTATION',
      implementationStep: 'START_CHANGE',
      decision: 'APPROVED',
      comment: 'change 已创建'
    });

    expect(result.currentStage).toBe('IMPLEMENTATION');
    expect(result.stages.IMPLEMENTATION.status).toBe('IN_PROGRESS');
    expect(result.implementationSteps?.START_CHANGE.status).toBe('APPROVED');
    expect(result.implementationSteps?.ARTIFACT_REVIEW.status).toBe('DRAFT');
    expect(result.reviews[0].implementationStep).toBe('START_CHANGE');
  });

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

  it('变更检查审核通过后解锁代码评审', async () => {
    const item = workflow();
    item.implementationSteps = {
      START_CHANGE: { step: 'START_CHANGE', status: 'APPROVED' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'DRAFT' }
    };
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const result = await applyReview(root, item, {
      requirementId: '172014',
      stage: 'IMPLEMENTATION',
      implementationStep: 'CHANGE_INSPECTION',
      decision: 'APPROVED',
      comment: '变更和测试证据通过'
    });

    expect(result.currentStage).toBe('CODE_REVIEW');
    expect(result.stages.IMPLEMENTATION.status).toBe('APPROVED');
    expect(result.stages.CODE_REVIEW.status).toBe('DRAFT');
  });

  it('历史 UNIT_TEST 审核记录不再推进实施阶段', async () => {
    const item = workflow();
    item.implementationSteps = {
      START_CHANGE: { step: 'START_CHANGE', status: 'APPROVED' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'DRAFT' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'DRAFT' }
    };
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const result = await applyReview(root, item, {
      requirementId: '172014',
      stage: 'IMPLEMENTATION',
      implementationStep: 'UNIT_TEST',
      decision: 'APPROVED',
      comment: '历史单测记录'
    });

    expect(result.currentStage).toBe('IMPLEMENTATION');
    expect(result.stages.IMPLEMENTATION.status).toBe('DRAFT');
    expect(result.implementationSteps?.CHANGE_INSPECTION.status).toBe('DRAFT');
    expect(result.reviews[0].implementationStep).toBe('UNIT_TEST');
  });

  it('代码评审打回时回到开始实施子步骤', () => {
    const item = workflow();
    item.implementationSteps = {
      START_CHANGE: { step: 'START_CHANGE', status: 'APPROVED' },
      ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'APPROVED' },
      APPLY: { step: 'APPLY', status: 'APPROVED' },
      CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'APPROVED' },
      UNIT_TEST: { step: 'UNIT_TEST', status: 'APPROVED' }
    };

    const result = returnToImplementation(item, [{ id: 'issue-1', stage: 'CODE_REVIEW', severity: 'BLOCKER', title: '阻断问题', status: 'OPEN' }]);

    expect(result.currentStage).toBe('IMPLEMENTATION');
    expect(result.implementationSteps?.START_CHANGE.status).toBe('APPROVED');
    expect(result.implementationSteps?.ARTIFACT_REVIEW.status).toBe('APPROVED');
    expect(result.implementationSteps?.APPLY.status).toBe('DRAFT');
    expect(result.implementationSteps?.CHANGE_INSPECTION.status).toBe('NOT_STARTED');
    expect(result.implementationSteps?.UNIT_TEST).toBeUndefined();
  });

  it('刷新代码评审问题时优先解析需求目录下的 commit 正式汇总', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const item = {
      ...workflow(),
      branchName: 'feature/opp-172014'
    };
    await writeReviewSummary(path.join(root, 'docs', '172014', 'code-review', 'summary.md'), 'ROOT-001');
    await writeReviewSummary(path.join(root, 'docs', '172014', 'code-review', 'commit', 'summary.md'), 'COMMIT-001');
    await writeReviewSummary(path.join(root, 'docs', 'code_review', 'code_review_feature_opp_172014', 'summary.md'), 'LEGACY-001');

    const issues = await refreshCodeReviewIssues(root, item);

    expect(issues.map((issue) => issue.id)).toEqual(['COMMIT-001']);
    expect(issues[0].sourcePath).toContain('docs/172014/code-review/commit/summary.md');
  });

  it('新正式汇总不存在时回退解析旧代码评审路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const item = {
      ...workflow(),
      branchName: 'feature/opp-172014'
    };
    await writeReviewSummary(path.join(root, 'docs', 'code_review', 'code_review_feature_opp_172014', 'summary.md'), 'LEGACY-001');

    const issues = await refreshCodeReviewIssues(root, item);

    expect(issues.map((issue) => issue.id)).toEqual(['LEGACY-001']);
    expect(issues[0].sourcePath).toContain('docs/code_review/code_review_feature_opp_172014/summary.md');
  });
});
