import type { RequirementWorkflow, ReviewDecision, WorkflowStage, WorkflowStatus } from './workflow';
import { areAllImplementationStepsApproved, workflowStagesForWorkflow } from './workflow';

export function isStageComplete(status: WorkflowStatus): boolean {
  return status === 'APPROVED' || status === 'SKIPPED';
}

export function nextStage(stage: WorkflowStage, workflow?: RequirementWorkflow): WorkflowStage | 'DONE' {
  const stages = workflowStagesForWorkflow(workflow);
  const index = stages.indexOf(stage);
  if (index < 0) {
    return stages[0] || 'DONE';
  }
  return index === stages.length - 1 ? 'DONE' : stages[index + 1];
}

export function previousStagesApproved(workflow: RequirementWorkflow, stage: WorkflowStage): boolean {
  const stages = workflowStagesForWorkflow(workflow);
  const index = stages.indexOf(stage);
  if (index < 0) {
    return false;
  }
  return stages.slice(0, index).every((item) => isStageComplete(workflow.stages[item].status));
}

export function canEnterStage(workflow: RequirementWorkflow, stage: WorkflowStage): boolean {
  const stages = workflowStagesForWorkflow(workflow);
  if (!stages.includes(stage)) {
    return false;
  }
  if (stage === stages[0]) {
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
  if (stage === 'IMPLEMENTATION') {
    return areAllImplementationStepsApproved(workflow.implementationSteps)
      || Boolean(workflow.stages[stage].artifactPath || workflow.artifacts.some((artifact) => artifact.stage === stage && artifact.exists));
  }
  if (stage === 'RETROSPECTIVE') {
    const hasArtifact = Boolean(workflow.stages[stage].artifactPath || workflow.artifacts.some((artifact) => artifact.stage === stage && artifact.exists));
    const pendingCandidates = workflow.retrospective?.pendingCandidateCount || 0;
    const unresolvedRisks = workflow.retrospective?.unresolvedRiskCount || 0;
    const risksAccepted = unresolvedRisks === 0 || Boolean(workflow.retrospective?.riskAcceptedAt);
    return hasArtifact && pendingCandidates === 0 && risksAccepted;
  }
  return Boolean(workflow.stages[stage].artifactPath || workflow.artifacts.some((artifact) => artifact.stage === stage && artifact.exists));
}

export function deriveCurrentStage(workflow: RequirementWorkflow): WorkflowStage | 'DONE' {
  for (const stage of workflowStagesForWorkflow(workflow)) {
    if (!isStageComplete(workflow.stages[stage].status)) {
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
