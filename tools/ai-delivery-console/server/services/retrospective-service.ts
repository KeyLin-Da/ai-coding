import fs from 'node:fs/promises';
import type { MemoryRecallFeedbackFile, RetrospectiveEvidenceFile, RetrospectiveMemoryCandidatesFile, RetrospectiveSummary } from '../../shared/memory';
import type { RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { normalizeRequirementId, assertInsideWorkspace } from './workspace';
import { MemoryRepository } from './memory-repository';

export function retrospectiveDir(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/retrospective`;
}

export function retrospectiveSummaryPath(requirementId: string): string {
  return `${retrospectiveDir(requirementId)}/summary.md`;
}

export function retrospectiveEvidencePath(requirementId: string): string {
  return `${retrospectiveDir(requirementId)}/evidence.json`;
}

export function retrospectiveCandidatesPath(requirementId: string): string {
  return `${retrospectiveDir(requirementId)}/memory-candidates.json`;
}

export function retrospectiveRecallFeedbackPath(requirementId: string): string {
  return `${retrospectiveDir(requirementId)}/recall-feedback.json`;
}

async function exists(workspaceRoot: string, relativePath: string): Promise<boolean> {
  return fs
    .access(assertInsideWorkspace(workspaceRoot, relativePath))
    .then(() => true)
    .catch((error: any) => {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    });
}

async function readJsonIfExists<T>(workspaceRoot: string, relativePath: string): Promise<T | undefined> {
  const absolute = assertInsideWorkspace(workspaceRoot, relativePath);
  const raw = await fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  return raw ? JSON.parse(raw) as T : undefined;
}

function retrospectiveImportRunId(workflow: RequirementWorkflow, preferredRunId?: string): string {
  if (preferredRunId) {
    return preferredRunId;
  }
  const stageRunId = workflow.stages.RETROSPECTIVE?.runId;
  if (stageRunId) {
    return stageRunId;
  }
  const latestRun = [...(workflow.runs || [])]
    .reverse()
    .find((run) => run.actionType === 'RETROSPECTIVE_GENERATE');
  return latestRun?.id || `retrospective-${normalizeRequirementId(workflow.requirementId)}`;
}

export async function getRetrospectiveSummary(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  projectId?: string,
  importRunId?: string
): Promise<RetrospectiveSummary> {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const summaryPath = retrospectiveSummaryPath(requirementId);
  const evidencePath = retrospectiveEvidencePath(requirementId);
  const candidatePath = retrospectiveCandidatesPath(requirementId);
  const recallFeedbackPath = retrospectiveRecallFeedbackPath(requirementId);
  let parseError: string | undefined;
  let evidenceCount = 0;
  let recallFeedbackCount = 0;

  try {
    const evidenceFile = await readJsonIfExists<RetrospectiveEvidenceFile>(workspaceRoot, evidencePath);
    evidenceCount = Array.isArray(evidenceFile?.items) ? evidenceFile.items.length : 0;
  } catch (error: any) {
    parseError = `复盘证据文件解析失败: ${error?.message || 'unknown error'}`;
  }

  try {
    const feedbackFile = await readJsonIfExists<MemoryRecallFeedbackFile>(workspaceRoot, recallFeedbackPath);
    recallFeedbackCount = Array.isArray(feedbackFile?.items) ? feedbackFile.items.length : 0;
  } catch (error: any) {
    parseError = parseError || `引用反馈文件解析失败: ${error?.message || 'unknown error'}`;
  }

  const repository = new MemoryRepository(workspaceRoot);
  try {
    const candidateFile = await readJsonIfExists<RetrospectiveMemoryCandidatesFile>(workspaceRoot, candidatePath);
    if (candidateFile?.items?.length) {
      await repository.importRetrospectiveCandidates({
        projectId,
        requirementId,
        runId: retrospectiveImportRunId(workflow, importRunId),
        sourcePath: candidatePath,
        sourceArtifactPath: retrospectiveSummaryPath(requirementId),
        candidates: candidateFile.items
      });
    }
  } catch (error: any) {
    parseError = parseError || `复盘候选经验文件解析失败: ${error?.message || 'unknown error'}`;
  }

  const candidatePage = await repository.listCandidates({
    requirementId,
    pageSize: 200
  });
  const retrospectiveCandidates = candidatePage.items.filter((item) => item.sourceType === 'RETROSPECTIVE');
  const pendingCandidateCount = retrospectiveCandidates.filter((item) => item.status === 'PENDING_CONFIRM').length;
  const unresolvedRiskCount = workflow.retrospective?.unresolvedRiskCount || 0;
  const summaryExists = await exists(workspaceRoot, summaryPath);
  const readyForReview = summaryExists && !parseError && pendingCandidateCount === 0 && (unresolvedRiskCount === 0 || Boolean(workflow.retrospective?.riskAcceptedAt));

  return {
    summaryPath: summaryExists ? summaryPath : undefined,
    evidencePath: await exists(workspaceRoot, evidencePath) ? evidencePath : undefined,
    candidatePath: await exists(workspaceRoot, candidatePath) ? candidatePath : undefined,
    recallFeedbackPath: await exists(workspaceRoot, recallFeedbackPath) ? recallFeedbackPath : undefined,
    evidenceCount,
    candidateCount: retrospectiveCandidates.length,
    pendingCandidateCount,
    recallFeedbackCount,
    unresolvedRiskCount,
    riskAcceptedAt: workflow.retrospective?.riskAcceptedAt,
    readyForReview,
    parseError
  };
}

export async function importRetrospectiveRunOutputs(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  projectId?: string
): Promise<{ workflow: RequirementWorkflow; importedCandidateCount: number; parseError?: string }> {
  if (run.actionType !== 'RETROSPECTIVE_GENERATE' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return { workflow, importedCandidateCount: 0 };
  }

  const requirementId = normalizeRequirementId(workflow.requirementId);
  const candidatePath = retrospectiveCandidatesPath(requirementId);
  let parseError: string | undefined;
  let importedCandidateCount = 0;

  try {
    const file = await readJsonIfExists<RetrospectiveMemoryCandidatesFile>(workspaceRoot, candidatePath);
    if (file?.items?.length) {
      const imported = await new MemoryRepository(workspaceRoot).importRetrospectiveCandidates({
        projectId,
        requirementId,
        runId: run.id,
        sourcePath: candidatePath,
        sourceArtifactPath: retrospectiveSummaryPath(requirementId),
        candidates: file.items
      });
      importedCandidateCount = imported.length;
    }
  } catch (error: any) {
    parseError = `复盘候选经验文件解析失败: ${error?.message || 'unknown error'}`;
  }

  const summary = await getRetrospectiveSummary(workspaceRoot, workflow, projectId, run.id);
  const nextWorkflow: RequirementWorkflow = {
    ...workflow,
    retrospective: {
      ...(workflow.retrospective || {}),
      summaryPath: summary.summaryPath,
      evidencePath: summary.evidencePath,
      candidateCount: summary.candidateCount,
      pendingCandidateCount: summary.pendingCandidateCount,
      recallFeedbackCount: summary.recallFeedbackCount,
      unresolvedRiskCount: summary.unresolvedRiskCount
    },
    stages: {
      ...workflow.stages,
      RETROSPECTIVE: {
        ...workflow.stages.RETROSPECTIVE,
        artifactPath: summary.summaryPath || workflow.stages.RETROSPECTIVE.artifactPath,
        runId: run.id,
        status: summary.summaryPath ? 'READY_FOR_REVIEW' : workflow.stages.RETROSPECTIVE.status
      }
    }
  };

  return {
    workflow: nextWorkflow,
    importedCandidateCount,
    parseError: parseError || summary.parseError
  };
}

export async function writeRetrospectiveRiskAccepted(workspaceRoot: string, workflow: RequirementWorkflow, actor = 'local-user'): Promise<RequirementWorkflow> {
  const now = new Date().toISOString();
  return {
    ...workflow,
    retrospective: {
      ...(workflow.retrospective || {}),
      riskAcceptedAt: now,
      riskAcceptedBy: actor
    }
  };
}
