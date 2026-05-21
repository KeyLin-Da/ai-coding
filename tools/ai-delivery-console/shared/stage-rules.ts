import type { RequirementWorkflow, ReviewDecision, WorkflowStage } from './workflow';
import { workflowStages } from './workflow';

export function nextStage(stage: WorkflowStage): WorkflowStage | 'DONE' {
  const index = workflowStages.indexOf(stage);
  return index === workflowStages.length - 1 ? 'DONE' : workflowStages[index + 1];
}

export function previousStagesApproved(workflow: RequirementWorkflow, stage: WorkflowStage): boolean {
  const index = workflowStages.indexOf(stage);
  return workflowStages.slice(0, index).every((item) => workflow.stages[item].status === 'APPROVED');
}

export function canEnterStage(workflow: RequirementWorkflow, stage: WorkflowStage): boolean {
  if (stage === 'PRD') {
    return true;
  }
  return previousStagesApproved(workflow, stage);
}

export function canApproveStage(workflow: RequirementWorkflow, stage: WorkflowStage): boolean {
  if (!canEnterStage(workflow, stage)) {
    return false;
  }
  if (stage === 'CODE_REVIEW') {
    return !workflow.issues.some((issue) => issue.severity === 'BLOCKER' && issue.status === 'OPEN');
  }
  return Boolean(workflow.stages[stage].artifactPath || workflow.artifacts.some((artifact) => artifact.stage === stage && artifact.exists));
}

export function deriveCurrentStage(workflow: RequirementWorkflow): WorkflowStage | 'DONE' {
  for (const stage of workflowStages) {
    if (workflow.stages[stage].status !== 'APPROVED') {
      return stage;
    }
  }
  return 'DONE';
}

export function statusAfterReview(decision: ReviewDecision): 'APPROVED' | 'REJECTED' | 'IN_REVIEW' {
  if (decision === 'APPROVED') {
    return 'APPROVED';
  }
  if (decision === 'REJECTED') {
    return 'REJECTED';
  }
  return 'IN_REVIEW';
}
