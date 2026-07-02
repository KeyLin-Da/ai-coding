import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { isShareableControlledArtifact } from '../../server/services/manual-artifact-sharing';

function workflow(): RequirementWorkflow {
  return {
    id: 100,
    requirementId: '172014',
    title: '测试需求',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp-172014',
    projects: [],
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages: {
      PRD: { stage: 'PRD', status: 'APPROVED', artifactPath: 'docs/172014/prd/analysis.md' },
      TECH_DESIGN: { stage: 'TECH_DESIGN', status: 'APPROVED', artifactPath: 'docs/172014/technical-design/design_review.md' },
      IMPLEMENTATION: { stage: 'IMPLEMENTATION', status: 'IN_PROGRESS', changeName: 'req-172014' },
      CODE_REVIEW: { stage: 'CODE_REVIEW', status: 'PENDING' }
    },
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('manual-artifact-sharing', () => {
  it('手工分享排除 reports 下的运行日志但保留普通报告', () => {
    const current = workflow();

    expect(isShareableControlledArtifact(current, 'docs/172014/reports/implementation-report.md')).toBe(true);
    expect(isShareableControlledArtifact(current, 'docs/172014/reports/run-20260610085925-588899.log')).toBe(false);
    expect(isShareableControlledArtifact(current, 'docs/172014/reports/run-20260629033308-ef7f42.md')).toBe(false);
  });
});
