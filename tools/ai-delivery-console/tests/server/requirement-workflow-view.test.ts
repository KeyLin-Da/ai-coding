import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow, TechDesignSourceFile } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { centerRequirementToWorkflow, mergeRequirementWorkflow } from '../../server/services/requirement-workflow-view';

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
});
