import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequirementWorkflow, ReviewInput, ReviewIssue, WorkflowStage } from '../../shared/workflow';
import { nextStage, statusAfterReview } from '../../shared/stage-rules';
import { createId, hashContent, sanitizeBranchName } from './workspace';
import { parseCodeReviewSummary } from './code-review-parser';

export async function applyReview(workspaceRoot: string, workflow: RequirementWorkflow, input: ReviewInput): Promise<RequirementWorkflow> {
  const artifactPath = input.artifactPath || workflow.stages[input.stage].artifactPath;
  let artifactHash: string | undefined;
  if (artifactPath) {
    const absolute = path.join(workspaceRoot, artifactPath);
    const content = await fs.readFile(absolute).catch(() => undefined);
    artifactHash = content ? hashContent(content) : undefined;
  }

  const review = {
    id: createId('review'),
    stage: input.stage,
    decision: input.decision,
    comment: input.comment,
    actor: input.actor || 'local-user',
    artifactPath,
    artifactHash,
    createdAt: new Date().toISOString()
  };

  workflow.reviews.unshift(review);
  workflow.stages[input.stage] = {
    ...workflow.stages[input.stage],
    status: statusAfterReview(input.decision),
    artifactPath,
    approvedAt: input.decision === 'APPROVED' ? review.createdAt : workflow.stages[input.stage].approvedAt,
    rejectedAt: input.decision === 'REJECTED' ? review.createdAt : workflow.stages[input.stage].rejectedAt,
    comment: input.comment
  };

  if (input.decision === 'APPROVED') {
    const next = nextStage(input.stage);
    workflow.currentStage = next;
    workflow.status = next === 'DONE' ? 'DONE' : 'IN_PROGRESS';
    if (next !== 'DONE' && workflow.stages[next].status === 'NOT_STARTED') {
      workflow.stages[next].status = 'DRAFT';
    }
  }

  if (input.decision === 'REJECTED') {
    workflow.currentStage = input.stage;
    workflow.status = 'REJECTED';
  }

  return workflow;
}

export async function refreshCodeReviewIssues(workspaceRoot: string, workflow: RequirementWorkflow): Promise<ReviewIssue[]> {
  if (!workflow.branchName) {
    return [];
  }
  const dir = path.join(workspaceRoot, 'docs', 'code_review', `code_review_${sanitizeBranchName(workflow.branchName)}`);
  const summaryPath = path.join(dir, 'summary.md');
  const issues = await parseCodeReviewSummary(summaryPath).catch(() => []);
  return issues;
}

export function returnToImplementation(workflow: RequirementWorkflow, issues: ReviewIssue[]): RequirementWorkflow {
  const openBlockers = issues.filter((issue) => issue.severity === 'BLOCKER' && issue.status === 'OPEN');
  workflow.issues = [...openBlockers, ...workflow.issues.filter((issue) => !openBlockers.some((item) => item.id === issue.id))];
  workflow.currentStage = 'IMPLEMENTATION';
  workflow.status = 'REJECTED';
  workflow.stages.IMPLEMENTATION.status = 'REJECTED';
  workflow.stages.IMPLEMENTATION.comment = `代码评审打回，待修复 ${openBlockers.length} 个阻断问题`;
  workflow.stages.CODE_REVIEW.status = 'REJECTED';
  return workflow;
}

export function stageFromArtifactPath(filePath: string): WorkflowStage {
  if (filePath.includes('/technical-design/')) {
    return 'TECH_DESIGN';
  }
  if (filePath.includes('/junit/') || filePath.includes('/openspec/')) {
    return 'IMPLEMENTATION';
  }
  if (filePath.includes('/code_review/')) {
    return 'CODE_REVIEW';
  }
  return 'PRD';
}
