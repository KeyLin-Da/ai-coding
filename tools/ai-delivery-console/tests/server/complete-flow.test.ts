import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkflowRepository } from '../../server/services/workflow-repository';
import { scanRequirementArtifacts } from '../../server/services/workspace-scanner';
import { applyReview, refreshCodeReviewIssues, returnToImplementation } from '../../server/services/review-service';

async function copyDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await copyDir(source, target);
      } else {
        await fs.copyFile(source, target);
      }
    })
  );
}

describe('完整交付流程 fixture', () => {
  it('覆盖 PRD 通过、技术方案通过、评审打回和回到实施阶段', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-flow-'));
    await copyDir(path.resolve('tests/fixtures/complete-workflow'), root);
    const repository = new WorkflowRepository(root);
    let workflow = await repository.upsert({ requirementId: '172014', title: '定位菜单', branchName: 'feature/opp-172014' });
    workflow.artifacts = await scanRequirementArtifacts(root, '172014', 'feature/opp-172014');

    workflow = await applyReview(root, workflow, {
      requirementId: '172014',
      stage: 'PRD',
      decision: 'APPROVED',
      comment: 'PRD 通过',
      artifactPath: 'docs/172014/prd/analysis.md'
    });
    workflow = await applyReview(root, workflow, {
      requirementId: '172014',
      stage: 'TECH_DESIGN',
      decision: 'APPROVED',
      comment: '技术方案通过',
      artifactPath: 'docs/172014/technical-design/design_review.md'
    });
    const issues = await refreshCodeReviewIssues(root, workflow);
    workflow = returnToImplementation(workflow, issues);

    expect(workflow.currentStage).toBe('IMPLEMENTATION');
    expect(workflow.issues[0].id).toBe('IS-001');
    expect(workflow.stages.IMPLEMENTATION.status).toBe('REJECTED');
  });
});
