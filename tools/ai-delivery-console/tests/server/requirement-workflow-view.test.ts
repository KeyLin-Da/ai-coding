import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow, TechDesignSourceFile } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  centerRequirementToWorkflow,
  clearCenterRequirementWorkflowCache,
  loadCachedCenterRequirementWorkflow,
  mergeRequirementWorkflow
} from '../../server/services/requirement-workflow-view';

function localRequirementWorkflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  const techDesignSourceFile: TechDesignSourceFile = {
    id: 'file-1',
    name: '复现场景.md',
    path: 'docs/172014/technical-design/file/file-1.md',
    size: 12,
    uploadedAt: now
  };
  const stages = createEmptyStages('REQUIREMENT');
  stages.PRD.status = 'DRAFT';
  stages.IMPLEMENTATION.changeName = 'req-172014';
  return {
    id: 100,
    requirementId: '172014',
    title: '旧需求',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp#172014',
    sources: ['docs/172014/prd/analysis.md'],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages,
    techDesignSourceFiles: [techDesignSourceFile],
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('requirement-workflow-view', () => {
  beforeEach(() => {
    clearCenterRequirementWorkflowCache();
    vi.clearAllMocks();
  });

  it('中心缺陷类型覆盖本地旧需求类型并保留项目 docs 补充材料', () => {
    const centerWorkflow = centerRequirementToWorkflow({
      id: 100,
      projectId: 10,
      requirementId: '172014',
      title: '积分异常缺陷',
      requirementType: 'DEFECT',
      branchName: 'bugfix/opp#172014',
      status: 'DRAFT',
      currentStage: 'TECH_DESIGN',
      stages: [
        {
          stage: 'TECH_DESIGN',
          status: 'DRAFT'
        }
      ]
    });

    const merged = mergeRequirementWorkflow(centerWorkflow, localRequirementWorkflow());

    expect(merged.requirementType).toBe('DEFECT');
    expect(merged.currentStage).toBe('TECH_DESIGN');
    expect(merged.stages.PRD.status).toBe('SKIPPED');
    expect(merged.stages.IMPLEMENTATION.changeName).toBe('req-172014');
    expect(merged.techDesignSourceFiles?.[0].path).toBe('docs/172014/technical-design/file/file-1.md');
  });

  it('中心实施步骤审核记录会恢复 OpenSpec 子步骤状态', () => {
    const centerWorkflow = centerRequirementToWorkflow({
      id: 100,
      projectId: 10,
      requirementId: '141846',
      title: '页面装修列表样式异常',
      requirementType: 'DEFECT',
      branchName: 'bugfix/opp#141846',
      status: 'IN_PROGRESS',
      currentStage: 'CODE_REVIEW',
      stages: [
        {
          stage: 'TECH_DESIGN',
          status: 'APPROVED'
        },
        {
          stage: 'IMPLEMENTATION',
          status: 'APPROVED'
        }
      ],
      reviews: [
        {
          id: 501,
          stage: 'IMPLEMENTATION',
          implementationStep: 'START_CHANGE',
          decision: 'APPROVED',
          comment: '开始变更通过',
          actorId: 1,
          createdAt: '2026-06-14T10:00:00'
        }
      ]
    });

    expect(centerWorkflow.reviews[0].implementationStep).toBe('START_CHANGE');
    expect(centerWorkflow.implementationSteps?.START_CHANGE.status).toBe('APPROVED');
    expect(centerWorkflow.implementationSteps?.ARTIFACT_REVIEW.status).toBe('DRAFT');
    expect(centerWorkflow.stages.IMPLEMENTATION.status).toBe('IN_PROGRESS');
    expect(centerWorkflow.currentStage).toBe('IMPLEMENTATION');
  });

  it('中心详情读取超时时先返回 undefined，并在完成后命中短缓存', async () => {
    let resolveResponse!: (value: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    const context = {
      centerBaseUrl: 'http://center.local',
      projectId: '5',
      userId: '1',
      fetchImpl
    };

    const timedOut = await loadCachedCenterRequirementWorkflow(context, '172014', { timeoutMs: 1, cacheTtlMs: 10_000 });

    expect(timedOut).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveResponse(jsonResponse({
      id: 100,
      projectId: 5,
      requirementId: '172014',
      title: '中心需求',
      requirementType: 'REQUIREMENT',
      status: 'IN_PROGRESS',
      currentStage: 'TECH_DESIGN'
    }));
    await flushPromises();

    const cached = await loadCachedCenterRequirementWorkflow(context, '172014', { timeoutMs: 1, cacheTtlMs: 10_000 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cached?.title).toBe('中心需求');
  });
});

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    json: async () => ({ data })
  } as Response;
}

function flushPromises() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
