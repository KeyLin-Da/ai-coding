import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequirementWorkflow, ReviewInput, ReviewIssue, WorkflowStage } from '../../shared/workflow';
import { areAllImplementationStepsApproved, ensureImplementationSteps, isImplementationStep, nextImplementationStep } from '../../shared/workflow';
import { nextStage, statusAfterReview } from '../../shared/stage-rules';
import { createId, hashContent, normalizeRequirementId, sanitizeBranchName } from './workspace';
import { parseCodeReviewSummary } from './code-review-parser';

function isPositiveDecision(decision: ReviewInput['decision']): boolean {
  return decision === 'APPROVED' || decision === 'RISK_ACCEPTED';
}

async function parseFirstExistingSummary(summaryPaths: string[]): Promise<ReviewIssue[]> {
  for (const summaryPath of summaryPaths) {
    const exists = await fs
      .access(summaryPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return parseCodeReviewSummary(summaryPath).catch(() => []);
    }
  }
  return [];
}

export async function applyReview(workspaceRoot: string, workflow: RequirementWorkflow, input: ReviewInput): Promise<RequirementWorkflow> {
  const positiveDecision = isPositiveDecision(input.decision);
  if (input.stage === 'IMPLEMENTATION' && !input.implementationStep && positiveDecision && !areAllImplementationStepsApproved(workflow.implementationSteps)) {
    throw new Error('实施验证子步骤未全部通过，无法审核实施验证');
  }

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
    implementationStep: input.implementationStep,
    decision: input.decision,
    comment: input.comment,
    actor: input.actor || 'local-user',
    artifactPath,
    artifactHash,
    createdAt: new Date().toISOString()
  };

  workflow.reviews.unshift(review);

  if (input.stage === 'IMPLEMENTATION' && input.implementationStep) {
    if (!isImplementationStep(input.implementationStep)) {
      return workflow;
    }
    const steps = ensureImplementationSteps(workflow.implementationSteps);
    const step = input.implementationStep;
    steps[step] = {
      ...steps[step],
      status: statusAfterReview(input.decision),
      approvedAt: input.decision === 'APPROVED' ? review.createdAt : steps[step].approvedAt,
      rejectedAt: input.decision === 'REJECTED' ? review.createdAt : steps[step].rejectedAt,
      comment: input.comment
    };
    workflow.implementationSteps = steps;

    workflow.stages.IMPLEMENTATION = {
      ...workflow.stages.IMPLEMENTATION,
      artifactPath: artifactPath || workflow.stages.IMPLEMENTATION.artifactPath,
      comment: input.comment
    };

    if (input.decision === 'APPROVED') {
      const next = nextImplementationStep(step);
      if (next) {
        if (steps[next].status === 'NOT_STARTED') {
          steps[next].status = 'DRAFT';
        }
      }
      workflow.stages.IMPLEMENTATION.status = 'IN_PROGRESS';
      workflow.currentStage = 'IMPLEMENTATION';
      workflow.status = 'IN_PROGRESS';
    }

    if (input.decision === 'REJECTED') {
      workflow.currentStage = 'IMPLEMENTATION';
      workflow.status = 'REJECTED';
      workflow.stages.IMPLEMENTATION.status = 'REJECTED';
      workflow.stages.IMPLEMENTATION.rejectedAt = review.createdAt;
    }

    if (input.decision === 'RISK_ACCEPTED') {
      workflow.currentStage = 'IMPLEMENTATION';
      workflow.status = 'IN_PROGRESS';
      workflow.stages.IMPLEMENTATION.status = 'IN_REVIEW';
    }

    return workflow;
  }

  workflow.stages[input.stage] = {
    ...workflow.stages[input.stage],
    status: input.decision === 'RISK_ACCEPTED' ? 'APPROVED' : statusAfterReview(input.decision),
    artifactPath,
    approvedAt: positiveDecision ? review.createdAt : workflow.stages[input.stage].approvedAt,
    rejectedAt: input.decision === 'REJECTED' ? review.createdAt : workflow.stages[input.stage].rejectedAt,
    comment: input.comment
  };

  if (positiveDecision) {
    const next = nextStage(input.stage, workflow);
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
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const summaryPaths = [
    path.join(workspaceRoot, 'docs', requirementId, 'code-review', 'commit', 'summary.md'),
    path.join(workspaceRoot, 'docs', requirementId, 'code-review', 'summary.md')
  ];

  if (workflow.branchName) {
    summaryPaths.push(path.join(workspaceRoot, 'docs', 'code_review', `code_review_${sanitizeBranchName(workflow.branchName)}`, 'summary.md'));
  }

  return parseFirstExistingSummary(summaryPaths);
}

export function returnToImplementation(workflow: RequirementWorkflow, issues: ReviewIssue[]): RequirementWorkflow {
  const openBlockers = issues.filter((issue) => issue.severity === 'BLOCKER' && issue.status === 'OPEN');
  workflow.issues = [...openBlockers, ...workflow.issues.filter((issue) => !openBlockers.some((item) => item.id === issue.id))];
  const steps = ensureImplementationSteps(workflow.implementationSteps);
  steps.APPLY.status = 'DRAFT';
  steps.APPLY.comment = `代码评审打回，待修复 ${openBlockers.length} 个阻断问题`;
  steps.CHANGE_INSPECTION.status = 'NOT_STARTED';
  workflow.implementationSteps = steps;
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
  if (filePath.includes('/code-review/') || filePath.includes('/code_review/')) {
    return 'CODE_REVIEW';
  }
  return 'PRD';
}
