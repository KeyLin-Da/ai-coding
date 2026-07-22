import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionType, RequirementWorkflow, RunRecord, WorkflowStage } from '../../shared/workflow';
import type {
  MemoryRecallConfirmInput,
  MemoryRecallDismissInput,
  MemoryRecallPreviewItem,
  MemoryRecallPreviewResult,
  MemoryRecallRecord
} from '../../shared/memory';
import { createId, hashContent, assertInsideWorkspace } from './workspace';
import { MemoryRepository, memoryCardContentHash } from './memory-repository';
import { requirementMemoryRecallPath } from './memory-paths';
import { searchProjectMemory, type MemorySearchResult } from './memory-search-service';
import { buildMemoryQueryProfile } from './memory-query-profile-service';
import { defaultMemorySearchConfig } from './memory-search-config';

export interface MemoryRecallInput {
  projectId?: string;
  actionType: ActionType;
  stage?: WorkflowStage;
  runId: string;
  sourceFilePaths?: string[];
  clarification?: string;
  runIntent?: string;
}

export interface MemoryRecallResult {
  recallPath?: string;
  results: MemorySearchResult[];
  records: MemoryRecallRecord[];
  previewId?: string;
}

function artifactPathForStage(workflow: RequirementWorkflow, stage?: WorkflowStage): string | undefined {
  if (stage === 'TECH_DESIGN') {
    return workflow.techDesignDocument || workflow.stages.TECH_DESIGN.artifactPath || `docs/${workflow.requirementId}/technical-design/design_review.md`;
  }
  return stage ? workflow.stages[stage]?.artifactPath : undefined;
}

async function readArtifactContent(workspaceRoot: string, filePath?: string): Promise<string> {
  if (!filePath) {
    return '';
  }
  const absolute = assertInsideWorkspace(workspaceRoot, filePath);
  return fs.readFile(absolute, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
}

function renderRecallMarkdown(workflow: RequirementWorkflow, results: MemorySearchResult[]): string {
  const lines = [
    '# 本次召回记忆',
    '',
    `需求编号: ${workflow.requirementId}`,
    `生成时间: ${new Date().toISOString()}`,
    '',
    '以下内容来自当前项目已确认的交付经验记忆，且已由用户在生成前确认使用。',
    ''
  ];
  const active = results.filter((item) => item.card.status === 'ACTIVE');
  const pending = results.filter((item) => item.card.status === 'PENDING_VERIFY');
  if (active.length) {
    lines.push('## 已确认经验', '');
    for (const [index, item] of active.entries()) {
      lines.push(`${index + 1}. ${item.card.statement}`);
      lines.push(`   - 分类: ${item.card.type}`);
      lines.push(`   - 标签: ${item.card.tags.join(', ') || '-'}`);
      lines.push(`   - 命中原因: ${item.reasons.join('；') || '-'}`);
      lines.push(`   - 来源: ${item.card.evidence[0]?.requirementId || '-'} ${item.card.evidence[0]?.path || ''}`.trimEnd());
      lines.push('');
    }
  }
  if (pending.length) {
    lines.push('## 待验证检查项', '');
    for (const [index, item] of pending.entries()) {
      lines.push(`${index + 1}. ${item.card.statement}`);
      lines.push('   - 注意: 该记忆尚待验证，不可作为已确认事实直接写入结论。');
      lines.push(`   - 命中原因: ${item.reasons.join('；') || '-'}`);
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function previewItem(result: MemorySearchResult): MemoryRecallPreviewItem {
  const contentHash = result.card.contentHash || memoryCardContentHash(result.card);
  return {
    memoryId: result.card.id,
    statement: result.card.statement,
    type: result.card.type,
    status: result.card.status,
    confidence: result.card.confidence,
    sourceSummary: result.sourceSummary || result.card.evidence[0]?.requirementId || '项目记忆',
    updatedAt: result.card.updatedAt,
    score: result.score,
    selectedByDefault: result.selectedByDefault === true,
    reasons: result.reasons,
    scoreBreakdown: result.scoreBreakdown || { scopeMatched: true, final: result.score },
    memoryContentHash: contentHash
  };
}

function createRecallRecord(
  input: MemoryRecallInput,
  workflow: RequirementWorkflow,
  result: MemorySearchResult,
  status: MemoryRecallRecord['recallStatus'],
  recallPath?: string,
  artifactPath?: string,
  artifactHash?: string,
  skipReason?: string,
  extra: Partial<MemoryRecallRecord> = {}
): MemoryRecallRecord {
  const now = new Date().toISOString();
  const contentHash = result.card.contentHash || memoryCardContentHash(result.card);
  return {
    id: createId('recall'),
    projectId: input.projectId,
    requirementId: workflow.requirementId,
    actionType: input.actionType,
    stage: input.stage,
    runId: input.runId,
    memoryId: result.card.id,
    recallStatus: status,
    injectedPath: recallPath,
    artifactPath,
    artifactHash,
    memoryContentHash: contentHash,
    memoryVersion: result.card.version || contentHash.slice(0, 12),
    scoreBreakdown: result.scoreBreakdown,
    skipReason,
    createdAt: now,
    updatedAt: now,
    ...extra
  };
}

function createDismissRecord(
  input: MemoryRecallInput,
  workflow: RequirementWorkflow,
  result: MemorySearchResult,
  dismissed: MemoryRecallDismissInput,
  previewId?: string
): MemoryRecallRecord {
  return createRecallRecord(input, workflow, result, 'DISMISSED', undefined, undefined, undefined, undefined, {
    previewId,
    selectedByUser: false,
    dismissedReason: dismissed.reason
  });
}

async function searchForRecall(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: Omit<MemoryRecallInput, 'runId'>,
  limit?: number
): Promise<{ previewId: string; results: MemorySearchResult[]; profileHash: string }> {
  const config = defaultMemorySearchConfig();
  const profile = await buildMemoryQueryProfile(workspaceRoot, workflow, {
    actionType: input.actionType,
    stage: input.stage,
    sourceFilePaths: input.sourceFilePaths,
    clarification: input.clarification,
    runIntent: input.runIntent
  }, config);
  const results = await searchProjectMemory(workspaceRoot, workflow, {
    projectId: input.projectId,
    stage: input.stage,
    queryProfile: profile,
    sourceFilePaths: input.sourceFilePaths,
    clarification: input.clarification,
    runIntent: input.runIntent,
    limit: limit || config.thresholds.maxPreviewItems
  });
  return {
    previewId: `recall-preview-${profile.queryProfileHash.slice(0, 12)}`,
    results,
    profileHash: profile.queryProfileHash
  };
}

export async function previewMemoryRecallForRun(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: Omit<MemoryRecallInput, 'runId'>
): Promise<MemoryRecallPreviewResult> {
  const config = defaultMemorySearchConfig();
  const profile = await buildMemoryQueryProfile(workspaceRoot, workflow, {
    actionType: input.actionType,
    stage: input.stage,
    sourceFilePaths: input.sourceFilePaths,
    clarification: input.clarification,
    runIntent: input.runIntent
  }, config);
  const results = await searchProjectMemory(workspaceRoot, workflow, {
    projectId: input.projectId,
    stage: input.stage,
    queryProfile: profile,
    sourceFilePaths: input.sourceFilePaths,
    clarification: input.clarification,
    runIntent: input.runIntent,
    limit: config.thresholds.maxPreviewItems
  });
  return {
    previewId: `recall-preview-${profile.queryProfileHash.slice(0, 12)}`,
    queryProfile: profile,
    items: results.map(previewItem)
  };
}

export async function confirmMemoryRecallForRun(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: MemoryRecallInput & Pick<MemoryRecallConfirmInput, 'selectedMemoryIds' | 'dismissed' | 'previewId' | 'force'>
): Promise<MemoryRecallResult> {
  if (!input.selectedMemoryIds?.length && !input.dismissed?.length) {
    return { results: [], records: [], previewId: input.previewId };
  }
  const repository = new MemoryRepository(workspaceRoot);
  const config = defaultMemorySearchConfig();
  const search = await searchForRecall(workspaceRoot, workflow, input, config.thresholds.maxPreviewItems);
  const results = search.results;
  const resultById = new Map(results.map((result) => [result.card.id, result]));
  const selectedResults = (input.selectedMemoryIds || []).map((memoryId) => resultById.get(memoryId)).filter(Boolean) as MemorySearchResult[];
  const dismissedRecords = (input.dismissed || [])
    .map((dismissed) => {
      const result = resultById.get(dismissed.memoryId);
      return result ? createDismissRecord(input, workflow, result, dismissed, input.previewId || search.previewId) : undefined;
    })
    .filter(Boolean) as MemoryRecallRecord[];

  if (!selectedResults.length) {
    if (dismissedRecords.length) {
      await repository.appendRecallRecords(dismissedRecords);
    }
    return { results, records: dismissedRecords, previewId: input.previewId || search.previewId };
  }

  const artifactPath = artifactPathForStage(workflow, input.stage);
  const artifactContent = await readArtifactContent(workspaceRoot, artifactPath);
  const artifactHash = artifactContent ? hashContent(artifactContent) : undefined;
  const existingLedger = await repository.readRecallLedger();
  const injectable: Array<{ result: MemorySearchResult; status: MemoryRecallRecord['recallStatus'] }> = [];
  const skipped: MemoryRecallRecord[] = [];

  for (const result of selectedResults.slice(0, config.thresholds.maxInjectedItems)) {
    const contentHash = result.card.contentHash || memoryCardContentHash(result.card);
    const latestRecord = existingLedger.find(
      (record) =>
        record.requirementId === workflow.requirementId
        && record.actionType === input.actionType
        && record.stage === input.stage
        && record.memoryId === result.card.id
        && ['APPLIED', 'INJECTED', 'REAPPLIED', 'UPDATED_RECALL', 'FORCE_REAPPLIED'].includes(record.recallStatus)
    );
    const sameAppliedVersion = existingLedger.some(
      (record) =>
        record.requirementId === workflow.requirementId
        && record.actionType === input.actionType
        && record.stage === input.stage
        && record.memoryId === result.card.id
        && record.memoryContentHash === contentHash
        && record.recallStatus === 'APPLIED'
    );
    if (sameAppliedVersion && !input.force) {
      skipped.push(createRecallRecord(input, workflow, result, 'SKIPPED_ALREADY_APPLIED', undefined, artifactPath, artifactHash, '同版本记忆已应用', {
        previewId: input.previewId || search.previewId,
        selectedByUser: true,
        queryProfileHash: search.profileHash
      }));
      continue;
    }
    if (input.force) {
      injectable.push({ result, status: 'FORCE_REAPPLIED' });
      continue;
    }
    if (latestRecord && latestRecord.memoryContentHash && latestRecord.memoryContentHash !== contentHash) {
      injectable.push({ result, status: 'UPDATED_RECALL' });
      continue;
    }
    injectable.push({ result, status: latestRecord ? 'REAPPLIED' : 'INJECTED' });
  }

  const records: MemoryRecallRecord[] = [...dismissedRecords, ...skipped];
  if (!injectable.length) {
    if (records.length) {
      await repository.appendRecallRecords(records);
    }
    return { results, records, previewId: input.previewId || search.previewId };
  }

  const recallPath = requirementMemoryRecallPath(workflow.requirementId, input.runId);
  const absolute = assertInsideWorkspace(workspaceRoot, recallPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, renderRecallMarkdown(workflow, injectable.map((item) => item.result)), 'utf8');
  const injected = injectable.map((item) => createRecallRecord(input, workflow, item.result, item.status, recallPath, artifactPath, artifactHash, undefined, {
    previewId: input.previewId || search.previewId,
    selectedByUser: true,
    queryProfileHash: search.profileHash
  }));
  records.push(...injected);
  await repository.appendRecallRecords(records);
  return {
    recallPath,
    results,
    records,
    previewId: input.previewId || search.previewId
  };
}

export async function prepareMemoryRecallForRun(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: MemoryRecallInput
): Promise<MemoryRecallResult> {
  const preview = await previewMemoryRecallForRun(workspaceRoot, workflow, input);
  return confirmMemoryRecallForRun(workspaceRoot, workflow, {
    ...input,
    previewId: preview.previewId,
    selectedMemoryIds: preview.items.map((item) => item.memoryId)
  });
}

export async function markMemoryRecallApplied(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  projectId?: string
): Promise<void> {
  if (run.actionType !== 'DESIGN_GENERATE' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return;
  }
  const repository = new MemoryRepository(workspaceRoot);
  const ledger = await repository.readRecallLedger();
  const appliedMemoryKeys = new Set(
    ledger
      .filter((record) => record.runId === run.id && record.recallStatus === 'APPLIED')
      .map((record) => `${record.memoryId}:${record.memoryContentHash || ''}`)
  );
  const pending = ledger.filter(
    (record) =>
      record.runId === run.id
      && ['INJECTED', 'REAPPLIED', 'UPDATED_RECALL', 'FORCE_REAPPLIED'].includes(record.recallStatus)
      && !appliedMemoryKeys.has(`${record.memoryId}:${record.memoryContentHash || ''}`)
  );
  if (!pending.length) {
    return;
  }
  const artifactPath = artifactPathForStage(workflow, 'TECH_DESIGN');
  const content = await readArtifactContent(workspaceRoot, artifactPath);
  const artifactHash = content ? hashContent(content) : undefined;
  const now = new Date().toISOString();
  const applied = pending.map((record) => ({
    ...record,
    id: createId('recall'),
    projectId: projectId || record.projectId,
    recallStatus: 'APPLIED' as const,
    artifactPath,
    artifactHash,
    updatedAt: now,
    createdAt: now
  }));
  await repository.appendRecallRecords(applied);
}

export const internalForTests = {
  renderRecallMarkdown,
  artifactPathForStage,
  previewItem
};
