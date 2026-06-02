import type { ImplementationStep, RunRecord, WorkflowStage } from '@shared/workflow';
import { implementationStepForAction, stageForAction } from '@shared/workflow';

function runStartedAt(run: RunRecord): number {
  const timestamp = Date.parse(run.startedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function findLatestStageRun(runs: RunRecord[], stage: WorkflowStage, implementationStep?: ImplementationStep): RunRecord | undefined {
  const matched = runs.filter((run) => {
    const runStage = run.stage || stageForAction(run.actionType);
    if (runStage !== stage) {
      return false;
    }
    if (stage !== 'IMPLEMENTATION') {
      return true;
    }
    return (run.implementationStep || implementationStepForAction(run.actionType)) === implementationStep;
  });

  return matched.sort((left, right) => runStartedAt(right) - runStartedAt(left))[0];
}
