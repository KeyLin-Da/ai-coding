import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import type {
  ActionInput,
  AiCodeCompletenessInput,
  GitDiffQueryInput,
  GitStageUntrackedInput,
  PrdSourceFile,
  RequirementInput,
  RequirementWorkflow,
  ReviewInput,
  RunRecord,
  SupplementBlock,
  SupplementInputsUpdate,
  TechDesignGenerationInputSnapshot,
  TechDesignSourceFile,
  WorkflowStatus
} from '../shared/workflow';
import { ensureImplementationSteps, isImplementationStep, stageForAction } from '../shared/workflow';
import { normalizePrdClarification, WorkflowRepository } from './services/workflow-repository';
import { scanRequirementArtifacts } from './services/workspace-scanner';
import { WorkflowLock } from './services/workflow-lock';
import { assertPrdClarificationReady, buildActionCommand, executeAction, validateActionInput } from './services/action-adapters';
import { appendRunEvent, appendStageCommandLog, readRunEvents, readRunEventsWithTranscript, readTerminalTranscriptChunk, readTerminalTranscriptSize } from './services/run-log';
import { readArtifact, saveArtifact } from './services/markdown-service';
import { applyReview, refreshCodeReviewIssues, returnToImplementation } from './services/review-service';
import {
  cancelAgentRun,
  finishCenterJobForRun,
  listAgentProviders,
  refreshTerminalRunStatuses,
  retryWorkflowCenterRunStatuses
} from './services/agent-providers';
import { normalizeOpenSpecChangeName, readOpenSpecSummary, updateOpenSpecTaskStatus } from './services/openspec-summary';
import { readGitChangedFilePreview, readGitChanges, readGitDiffPreview, stageUntrackedFiles } from './services/git-changes';
import {
  assertProjectsCleanAndPushed,
  buildAiCodeCompletenessState,
  calculateAiCodeCompleteness,
  captureBaseCommits,
  captureRemoteAiCommits,
  mergeAiCommitCaptures
} from './services/ai-code-completeness';
import { buildArtifactGitSyncPlan, confirmArtifactGitSync, type ArtifactGitSyncConfirmInput, type ArtifactGitSyncPlanInput } from './services/artifact-git-sync';
import { centerPublicRequest, centerRequest } from './services/center-client';
import { readProjectHistory, listProjectsFromConfiguredPaths } from './services/project-history';
import { assertProjectPathsConfigured, loadPrivateProjectSettings, loadSettings, saveSettings, validateSettings } from './services/project-settings';
import { parseLocalRequestContext, type LocalRequestContext } from './services/local-request-context';
import type { CenterRunnerConfig } from './services/center-runner-adapter';
import { retryWorkflowTokenUsageOutboxes } from './services/token-usage-recorder';
import { localServiceError } from './services/local-errors';
import { generateLocalGitCredential, regenerateLocalGitCredential, type LocalGitCredentialGenerateInput } from './services/local-git-credentials';
import { cloneProjectRepository, commitAndPushProjectRepository, inspectProjectRepository, readProjectRepositoryStatus, resolveProjectRepoPath, syncProjectRepository } from './services/project-repository';
import { bootstrapProjectArtifactWorkspace } from './services/skill-sync';
import { deleteTechDesignQuestionRecord, type DeleteTechDesignQuestionInput } from './services/tech-design-questions';
import {
  createTechDesignAnnotation,
  createTechDesignAnnotationReply,
  consumeTechDesignAnnotations,
  deleteTechDesignAnnotation,
  deleteTechDesignAnnotationReply,
  listTechDesignAnnotations,
  rebuildTechDesignAnnotationSummary,
  updateTechDesignAnnotationStatus
} from './services/tech-design-annotations';
import {
  centerTechDesignAnnotationsEnabled,
  consumeCenterTechDesignAnnotationsAndSnapshot,
  createCenterTechDesignAnnotation,
  createCenterTechDesignAnnotationReply,
  createPublicCenterTechDesignAnnotation,
  createPublicCenterTechDesignAnnotationReply,
  deleteCenterTechDesignAnnotation,
  deleteCenterTechDesignAnnotationReply,
  deletePublicCenterTechDesignAnnotation,
  deletePublicCenterTechDesignAnnotationReply,
  filterTechDesignAnnotationsByContentHash,
  listCenterTechDesignAnnotations,
  listPublicCenterTechDesignAnnotations,
  prepareCenterTechDesignAnnotationInput,
  updateCenterTechDesignAnnotationStatus
} from './services/center-tech-design-annotations';
import {
  consumeTechDesignInputLedger,
  consumedQuestionPathsFromLedger,
  mergeTechDesignInputLedgerIntoWorkflow
} from './services/tech-design-input-ledger';
import { createTechDesignDraftSnapshot, diffTechDesignVersions, listTechDesignVersions, readTechDesignVersionContent } from './services/tech-design-versions';
import { buildBootstrapImportPlan, importBootstrapPlan, type BootstrapImportConfig } from './services/bootstrap-importer';
import {
  listCenterRequirementWorkflows,
  loadCachedCenterRequirementWorkflow,
  loadCenterRequirementWorkflow,
  mergeRequirementWorkflow,
  upsertCenterRequirement
} from './services/requirement-workflow-view';
import {
  assertRequirementCollaborationWritable,
  assertRequirementWorkspaceWritable,
  reportRequirementWorkspaceState,
  scheduleRequirementWorkspaceStateReport
} from './services/requirement-workspace-state';
import {
  assertAllowedPrdSourceFile,
  deletePrdSourceFileSnapshot,
  deleteTechDesignSourceFileSnapshot,
  savePrdSourceFileSnapshot,
  saveTechDesignSourceFileSnapshot,
  type UploadedPrdSourceFile
} from './services/prd-source-files';
import { listOpenSpecVisualContextCandidates } from './services/open-spec-visual-context';
import {
  assertPreviewableArtifactPath,
  contentTypeForPath,
  normalizeShareArtifactPath,
  resolvePublicAssetPath,
  resolveSharePathInWorkspace
} from './services/artifact-share-paths';
import { findArtifactShareRoot, findArtifactShareToken, rememberArtifactShareLocation } from './services/artifact-share-locations';
import { MemoryRepository } from './services/memory-repository';
import { extractMemoryCandidatesForDesignRun } from './services/memory-candidate-service';
import { getRetrospectiveSummary, importRetrospectiveRunOutputs } from './services/retrospective-service';
import {
  confirmMemoryRecallForRun,
  markMemoryRecallApplied,
  prepareMemoryRecallForRun,
  previewMemoryRecallForRun
} from './services/memory-recall-service';
import { prepareOpenSpecArtifactAction } from './services/open-spec-artifact-inputs';
import { defaultMemorySearchConfig, mergeMemorySearchConfig } from './services/memory-search-config';
import { rebuildMemoryEmbeddingIndex } from './services/memory-embedding-service';
import type {
  MemoryCandidateConfirmInput,
  MemoryCandidateUpdateInput,
  MemoryCardCreateInput,
  MemoryCardUpdateInput,
  MemoryRecallConfirmInput,
  MemorySearchConfig
} from '../shared/memory';

interface ArtifactShareCreateInput {
  projectId?: number | string;
  requirementPk?: number | string;
  requirementId?: string;
  artifactPath?: string;
  expireAt?: string;
  showAnnotations?: boolean;
  allowDownload?: boolean;
}

interface ArtifactSharePayload {
  id: number;
  projectId: number;
  requirementPk?: number;
  requirementId: string;
  artifactPath: string;
  status: string;
  expireAt?: string;
  showAnnotations?: boolean;
  allowDownload?: boolean;
  token?: string;
  publicPath?: string;
  realtimeChannel?: string;
}

function centerRunnerConfig(context: LocalRequestContext): CenterRunnerConfig {
  return {
    centerBaseUrl: context.centerBaseUrl || 'http://127.0.0.1:8728',
    userId: context.userId,
    clientSessionId: context.clientSessionId || 0,
    accessToken: context.accessToken
  };
}

async function parseBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function hasBodyField<T extends object>(input: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeSupplementBlocksInput(value: unknown): SupplementBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const blocks: SupplementBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const block = item as Record<string, unknown>;
    const id = String(block.id || '').trim();
    if (!id) {
      continue;
    }
    if (block.type === 'PARAGRAPH') {
      const text = String(block.text || '').trim();
      if (text) {
        blocks.push({ id, type: 'PARAGRAPH', text });
      }
      continue;
    }
    if (block.type === 'IMAGE' || block.type === 'FILE') {
      blocks.push({
        id,
        type: block.type,
        fileId: String(block.fileId || id).trim(),
        name: String(block.name || '').trim(),
        path: String(block.path || '').trim(),
        size: Number(block.size || 0),
        mimeType: typeof block.mimeType === 'string' ? block.mimeType : undefined,
        uploadedAt: typeof block.uploadedAt === 'string' ? block.uploadedAt : undefined,
        caption: typeof block.caption === 'string' ? block.caption.trim() : undefined,
        status: block.status === 'UPLOADING' || block.status === 'FAILED' ? block.status : 'READY',
        error: typeof block.error === 'string' ? block.error : undefined,
        contextRole: block.contextRole === 'INLINE' || block.contextRole === 'ATTACHMENT'
          ? block.contextRole
          : /^pasted-/i.test(String(block.name || ''))
            ? 'INLINE'
            : 'ATTACHMENT'
      });
    }
  }
  return blocks;
}

function supplementBlockKeySet(value: unknown): Set<string> {
  const keys = new Set<string>();
  for (const block of normalizeSupplementBlocksInput(value)) {
    keys.add(block.id);
    if (block.type === 'IMAGE' || block.type === 'FILE') {
      [block.fileId, block.path].filter(Boolean).forEach((key) => keys.add(String(key)));
    }
  }
  return keys;
}

function supplementBlockConsumed(block: SupplementBlock, consumedKeys: Set<string>): boolean {
  if (consumedKeys.has(block.id)) {
    return true;
  }
  if (block.type === 'IMAGE' || block.type === 'FILE') {
    return consumedKeys.has(block.fileId) || consumedKeys.has(block.path);
  }
  return false;
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index >= 0) {
    parts.push(buffer.subarray(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function parseDisposition(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawValue.length) {
      continue;
    }
    result[rawKey] = rawValue.join('=').replace(/^"|"$/g, '');
  }
  return result;
}

function designDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  if (typeof params.documentPath === 'string' && params.documentPath.trim()) {
    return params.documentPath.trim();
  }
  const prdArtifactPath = workflow.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path;
  return prdArtifactPath || workflow.stages.PRD.artifactPath || `docs/${workflow.requirementId}/prd/analysis.md`;
}

function normalizeArtifactPath(filePath = ''): string {
  return filePath.trim().replace(/\\/g, '/');
}

function decodeArtifactViewPath(value = ''): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function decodeArtifactViewContext(value = ''): Partial<LocalRequestContext> {
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    return {
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
      clientSessionId: typeof parsed.clientSessionId === 'string' ? parsed.clientSessionId : '',
      userId: typeof parsed.userId === 'string' ? parsed.userId : '',
      centerBaseUrl: typeof parsed.centerBaseUrl === 'string' ? parsed.centerBaseUrl : ''
    };
  } catch {
    return {};
  }
}

const HTML_VIEW_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.svg',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot'
]);

function resolvePublicHtmlViewPath(requirementId: string, artifactPath: string, requestedPath: string): string {
  const normalizedArtifactPath = assertPreviewableArtifactPath(requirementId, artifactPath);
  const normalizedRequestedPath = normalizeShareArtifactPath(requestedPath);
  const artifactDir = path.posix.dirname(normalizedArtifactPath);
  const sameDirectory = normalizedRequestedPath === normalizedArtifactPath || normalizedRequestedPath.startsWith(`${artifactDir}/`);
  if (!sameDirectory || !HTML_VIEW_EXTENSIONS.has(path.extname(normalizedRequestedPath).toLowerCase())) {
    throw localServiceError('B70080', '分享产物路径不允许访问');
  }
  return normalizedRequestedPath;
}

function techDesignQuestionPathPrefix(requirementId: string): string {
  return `docs/${requirementId}/technical-design/questions/`;
}

function legacyTechDesignQuestionPath(requirementId: string): string {
  return `docs/${requirementId}/technical-design/questions.md`;
}

function isTechDesignQuestionPath(requirementId: string, filePath: string): boolean {
  const normalized = normalizeArtifactPath(filePath);
  return normalized === legacyTechDesignQuestionPath(requirementId) || normalized.startsWith(techDesignQuestionPathPrefix(requirementId));
}

function pendingTechDesignQuestionPaths(workflow: RequirementWorkflow, params: Record<string, unknown>): string[] {
  const requirementId = workflow.requirementId;
  const consumed = new Set((workflow.techDesignConsumedQuestionPaths || []).map(normalizeArtifactPath));
  const paths = new Set<string>();
  for (const artifact of workflow.artifacts) {
    const normalized = normalizeArtifactPath(artifact.path);
    if (artifact.exists && artifact.kind !== 'directory' && isTechDesignQuestionPath(requirementId, normalized) && !consumed.has(normalized)) {
      paths.add(normalized);
    }
  }
  const sourceFiles = Array.isArray(params.sourceFiles) ? params.sourceFiles : [];
  for (const source of sourceFiles) {
    if (typeof source !== 'string') {
      continue;
    }
    const normalized = normalizeArtifactPath(source);
    if (isTechDesignQuestionPath(requirementId, normalized) && !consumed.has(normalized)) {
      paths.add(normalized);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function uniqueNormalizedPaths(values: unknown[]): string[] {
  return [...new Set(values.map((value) => normalizeArtifactPath(typeof value === 'string' ? value : '')).filter(Boolean))];
}

export function captureTechDesignInputSnapshot(
  workflow: RequirementWorkflow,
  params: Record<string, unknown>,
  annotationIds: string[] = [],
  excludedSourcePaths: string[] = []
): TechDesignGenerationInputSnapshot {
  const questionPaths = pendingTechDesignQuestionPaths(workflow, params);
  const requestedSourceFiles = Array.isArray(params.sourceFiles) ? params.sourceFiles : [];
  const sourceCandidates = requestedSourceFiles.length
    ? requestedSourceFiles
    : (workflow.techDesignSourceFiles || []).map((file) => file.path);
  const questionPathSet = new Set(questionPaths);
  const excludedPathSet = new Set(uniqueNormalizedPaths(excludedSourcePaths));
  const sourceFilePaths = uniqueNormalizedPaths(sourceCandidates).filter(
    (filePath) => !questionPathSet.has(filePath) && !excludedPathSet.has(filePath)
  );
  const clarification = typeof params.clarification === 'string'
    ? params.clarification.trim()
    : String(workflow.techDesignClarification || '').trim();
  return {
    questionPaths,
    sourceFilePaths,
    clarification: clarification || undefined,
    annotationIds: [...new Set(annotationIds.map((id) => String(id || '').trim()).filter(Boolean))],
    capturedAt: new Date().toISOString()
  };
}

export async function consumeTechDesignInputsAfterRun(
  root: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  context?: LocalRequestContext
): Promise<RequirementWorkflow> {
  if (
    run.actionType !== 'DESIGN_GENERATE'
    || !['SUCCEEDED', 'COMPLETED'].includes(run.status)
    || run.techDesignInputsConsumedAt
  ) {
    return workflow;
  }
  const params = run.params || {};
  const snapshot = run.techDesignInputSnapshot;
  const consumedQuestionPaths = snapshot?.questionPaths || pendingTechDesignQuestionPaths(workflow, params);
  const consumedSourceFilePaths = snapshot?.sourceFilePaths
    || (workflow.techDesignSourceFiles || []).map((file) => file.path).filter(Boolean);
  const clarification = snapshot?.clarification
    ?? (typeof params.clarification === 'string' ? params.clarification : workflow.techDesignClarification || '');
  const ledger = await consumeTechDesignInputLedger(root, workflow.requirementId, {
    questionPaths: consumedQuestionPaths,
    sourceFilePaths: consumedSourceFilePaths,
    clarification,
    runId: run.id
  });
  if (context && centerTechDesignAnnotationsEnabled(context, workflow)) {
    await consumeCenterTechDesignAnnotationsAndSnapshot(root, context, workflow, run.id, snapshot?.annotationIds);
  } else {
    await consumeTechDesignAnnotations(root, workflow.requirementId, run.id, snapshot?.annotationIds);
  }
  run.techDesignInputsConsumedAt = new Date().toISOString();
  const ledgerQuestionPaths = consumedQuestionPathsFromLedger(ledger);
  const consumedSourcePathSet = new Set(consumedSourceFilePaths.map(normalizeArtifactPath));
  const currentClarification = String(workflow.techDesignClarification || '').trim();
  const consumedClarification = String(clarification || '').trim();
  const shouldKeepClarification = Boolean(snapshot && currentClarification !== consumedClarification);
  const consumedSupplementBlockKeys = supplementBlockKeySet(params.supplementBlocks);
  const nextTechDesignSupplementBlocks = snapshot
    ? (workflow.techDesignSupplementBlocks || []).filter((block) => {
        if (block.type === 'PARAGRAPH') {
          return shouldKeepClarification;
        }
        if (supplementBlockConsumed(block, consumedSupplementBlockKeys)) {
          return false;
        }
        return !consumedSourcePathSet.has(normalizeArtifactPath(block.path));
      })
    : [];
  return {
    ...workflow,
    techDesignClarification: shouldKeepClarification
      ? workflow.techDesignClarification
      : '',
    techDesignSupplementBlocks: nextTechDesignSupplementBlocks,
    techDesignSourceFiles: snapshot
      ? (workflow.techDesignSourceFiles || []).filter((file) => !consumedSourcePathSet.has(normalizeArtifactPath(file.path)))
      : [],
    techDesignConsumedQuestionPaths: [...new Set([...(workflow.techDesignConsumedQuestionPaths || []), ...ledgerQuestionPaths])]
  };
}

export async function finalizeSuccessfulTechDesignRuns(
  root: string,
  workflow: RequirementWorkflow,
  context?: LocalRequestContext
): Promise<{ workflow: RequirementWorkflow; changed: boolean }> {
  let nextWorkflow = workflow;
  let changed = false;
  for (const run of workflow.runs) {
    if (
      run.actionType !== 'DESIGN_GENERATE'
      || !run.techDesignInputSnapshot
      || run.techDesignInputsConsumedAt
      || !['SUCCEEDED', 'COMPLETED'].includes(run.status)
    ) {
      continue;
    }
    nextWorkflow = await consumeTechDesignInputsAfterRun(root, nextWorkflow, run, context);
    changed = true;
  }
  return { workflow: nextWorkflow, changed };
}

export async function finalizeSuccessfulTechDesignMemoryFeedback(
  root: string,
  workflow: RequirementWorkflow,
  context?: LocalRequestContext
): Promise<void> {
  for (const run of workflow.runs) {
    if (
      run.actionType !== 'DESIGN_GENERATE'
      || !run.techDesignInputSnapshot
      || !['SUCCEEDED', 'COMPLETED'].includes(run.status)
    ) {
      continue;
    }
    await markMemoryRecallApplied(root, workflow, run, context?.projectId ? String(context.projectId) : undefined);
  }
}

export async function finalizeSuccessfulRetrospectiveRuns(
  root: string,
  workflow: RequirementWorkflow,
  context?: LocalRequestContext
): Promise<{ workflow: RequirementWorkflow; changed: boolean; parseError?: string }> {
  let nextWorkflow = workflow;
  let changed = false;
  let parseError: string | undefined;
  for (const run of workflow.runs) {
    if (run.actionType !== 'RETROSPECTIVE_GENERATE' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
      continue;
    }
    const before = JSON.stringify({
      retrospective: nextWorkflow.retrospective,
      stage: nextWorkflow.stages.RETROSPECTIVE
    });
    const result = await importRetrospectiveRunOutputs(root, nextWorkflow, run, context?.projectId ? String(context.projectId) : undefined);
    nextWorkflow = result.workflow;
    parseError = parseError || result.parseError;
    const after = JSON.stringify({
      retrospective: nextWorkflow.retrospective,
      stage: nextWorkflow.stages.RETROSPECTIVE
    });
    changed = changed || before !== after || result.importedCandidateCount > 0;
  }
  return { workflow: nextWorkflow, changed, parseError };
}

function implementationStatusForRun(run: RunRecord): WorkflowStatus {
  if (run.status === 'SUCCEEDED') {
    return 'READY_FOR_REVIEW';
  }
  if (run.status === 'FAILED' || run.status === 'CANCELLED') {
    return 'BLOCKED';
  }
  return 'IN_PROGRESS';
}

export function applyImplementationRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (!isImplementationStep(run.implementationStep)) {
    return workflow;
  }
  const implementationSteps = ensureImplementationSteps(workflow.implementationSteps);
  implementationSteps[run.implementationStep] = {
    ...implementationSteps[run.implementationStep],
    status: implementationStatusForRun(run),
    runId: run.id
  };
  if (run.actionType === 'OPENSPEC_FF' && ['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    const invalidationComment = 'OpenSpec 工件已基于新技术方案版本重新生成，需重新审核后继续实施';
    if (implementationSteps.APPLY.status !== 'NOT_STARTED') {
      implementationSteps.APPLY = {
        ...implementationSteps.APPLY,
        status: 'DRAFT',
        comment: invalidationComment,
        approvedAt: undefined,
        rejectedAt: undefined
      };
    }
    if (implementationSteps.CHANGE_INSPECTION.status !== 'NOT_STARTED') {
      implementationSteps.CHANGE_INSPECTION = {
        ...implementationSteps.CHANGE_INSPECTION,
        status: 'NOT_STARTED',
        comment: invalidationComment,
        approvedAt: undefined,
        rejectedAt: undefined
      };
    }
  }
  const implementationStageStatus =
    run.actionType === 'OPENSPEC_FF' && ['SUCCEEDED', 'COMPLETED'].includes(run.status)
      ? 'IN_PROGRESS'
      : workflow.stages.IMPLEMENTATION.status === 'APPROVED'
        ? 'APPROVED'
        : 'IN_PROGRESS';
  return {
    ...workflow,
    implementationSteps,
    stages: {
      ...workflow.stages,
      IMPLEMENTATION: {
        ...workflow.stages.IMPLEMENTATION,
        status: implementationStageStatus,
        runId: run.id
      }
    }
  };
}

export function applyPrdClarificationRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (run.actionType !== 'PRD_CLARIFY' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return workflow;
  }
  const sources = Array.isArray(run.params?.sources)
    ? run.params.sources.map((item) => String(item).trim().replace(/\\/g, '/')).filter(Boolean)
    : [];
  const consumed = new Set(sources);
  const artifactPath =
    workflow.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path ||
    workflow.stages.PRD.artifactPath ||
    `docs/${workflow.requirementId}/prd/analysis.md`;
  return {
    ...workflow,
    prdClarification: '',
    prdClarificationBlocks: [],
    prdSourceFiles: (workflow.prdSourceFiles || []).filter((file) => !consumed.has(String(file.path || '').replace(/\\/g, '/'))),
    sources: (workflow.sources || []).filter((source) => !consumed.has(String(source || '').replace(/\\/g, '/'))),
    currentStage: 'PRD',
    status: 'IN_PROGRESS',
    stages: {
      ...workflow.stages,
      PRD: {
        ...workflow.stages.PRD,
        status: 'READY_FOR_REVIEW',
        artifactPath,
        runId: run.id
      }
    }
  };
}

export function consumePrdAnalyzeInputsAfterRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (run.actionType !== 'PRD_ANALYZE' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return workflow;
  }
  const sources = Array.isArray(run.params?.sources)
    ? run.params.sources.map((item) => String(item).trim().replace(/\\/g, '/')).filter(Boolean)
    : [];
  const consumed = new Set(sources);
  return {
    ...workflow,
    prdClarification: '',
    prdSupplementBlocks: [],
    prdSourceFiles: (workflow.prdSourceFiles || []).filter((file) => !consumed.has(String(file.path || '').replace(/\\/g, '/'))),
    sources: (workflow.sources || []).filter((source) => !consumed.has(String(source || '').replace(/\\/g, '/')))
  };
}

export function consumeOpenSpecArtifactInputsAfterRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (run.actionType !== 'OPENSPEC_FF' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return workflow;
  }
  const sourceFiles = Array.isArray(run.params?.sourceFiles)
    ? run.params.sourceFiles.map((item) => String(item).trim().replace(/\\/g, '/')).filter(Boolean)
    : [];
  const consumed = new Set(sourceFiles);
  return {
    ...workflow,
    openSpecArtifactAdjustment: '',
    openSpecSupplementBlocks: [],
    openSpecVisualContextPaths: [],
    techDesignSourceFiles: (workflow.techDesignSourceFiles || []).filter((file) => !consumed.has(String(file.path || '').replace(/\\/g, '/')))
  };
}

async function parseMultipartFiles(request: IncomingMessage): Promise<UploadedPrdSourceFile[]> {
  const contentType = request.headers['content-type'] || '';
  const boundary = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) {
    throw new Error('缺少 multipart boundary');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const files: UploadedPrdSourceFile[] = [];
  for (const rawPart of splitBuffer(body, boundaryBuffer)) {
    let part = rawPart;
    if (part.length < 4 || part.equals(Buffer.from('--\r\n')) || part.equals(Buffer.from('--'))) {
      continue;
    }
    if (part.subarray(0, 2).equals(Buffer.from('\r\n'))) {
      part = part.subarray(2);
    }
    if (part.subarray(part.length - 2).equals(Buffer.from('\r\n'))) {
      part = part.subarray(0, part.length - 2);
    }
    if (part.subarray(part.length - 2).equals(Buffer.from('--'))) {
      part = part.subarray(0, part.length - 2);
    }
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) {
      continue;
    }
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    const content = part.subarray(headerEnd + 4);
    const headers = Object.fromEntries(
      headerText.split('\r\n').map((line) => {
        const [name, ...value] = line.split(':');
        return [name.toLowerCase(), value.join(':').trim()];
      })
    );
    const disposition = parseDisposition(headers['content-disposition'] || '');
    if (!disposition.filename) {
      continue;
    }
    files.push({
      filename: path.basename(disposition.filename),
      mimeType: headers['content-type'],
      content
    });
  }
  return files;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-User-Id,X-Project-Id,X-Client-Session-Id,X-Center-Base-Url,X-AI-Delivery-Center-Base-Url,X-Runner-Base-Url',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  });
  response.end(JSON.stringify(body));
}

function match(pathname: string, pattern: RegExp): RegExpMatchArray | null {
  return pathname.match(pattern);
}

function statusForError(error: any): number {
  const code = error?.code;
  const status = Number(error?.status);
  // 中心服务返回的错误（无本地 error code），透传原始 HTTP 状态码
  if (!code && status >= 400 && status < 600) {
    return status;
  }
  const unauthorizedCodes = new Set(['B70001', 'B70061', 'B70062']);
  const forbiddenCodes = new Set(['B70002', 'B70046', 'B70063', 'B70080', 'B70082']);
  const notFoundCodes = new Set(['ENOENT', 'B70004', 'B70079', 'B70081']);
  const badRequestCodes = new Set(['VALIDATION_ERROR', 'B70003', 'B70043', 'B70065', 'B70066', 'B70077']);
  const conflictCodes = new Set([
    'ARTIFACT_CONFLICT',
    'B70020',
    'B70034',
    'B70035',
    'B70042',
    'B70047',
    'B70071',
    'B70072',
    'B70073',
    'B70074',
    'B70075',
    'B70076',
    'B70078'
  ]);
  if (unauthorizedCodes.has(code || '')) {
    return 401;
  }
  if (forbiddenCodes.has(code || '')) {
    return 403;
  }
  if (notFoundCodes.has(code || '')) {
    return 404;
  }
  if (badRequestCodes.has(code || '')) {
    return 400;
  }
  if (['B71002', 'B71003', 'B71004'].includes(code || '')) {
    return 400;
  }
  if (conflictCodes.has(code || '')) {
    return 409;
  }
  if (code === 'B71001') {
    return 404;
  }
    return 500;
}

export function createRouter(workspaceRoot: string) {
  const fallbackRepository = new WorkflowRepository(workspaceRoot);
  const artifactRefreshJobs = new Map<string, Promise<void>>();

  async function loadCurrentProjectPaths(context: LocalRequestContext, required = false): Promise<string[]> {
    const settings = await loadPrivateProjectSettings(context);
    if (required) {
      assertProjectPathsConfigured(settings);
    }
    return settings.projectPaths;
  }

  async function resolveArtifactRoot(context: LocalRequestContext, required = false): Promise<string> {
    try {
      return (await resolveProjectRepoPath(context)).repoPath;
    } catch (error) {
      if (required) {
        throw error;
      }
      return workspaceRoot;
    }
  }

  async function resolvePublicArtifactRoot(context: LocalRequestContext, share: ArtifactSharePayload): Promise<string> {
    const projectContext = { ...context, projectId: String(share.projectId) };
    if (projectContext.accessToken || projectContext.userId) {
      try {
        const authenticatedRoot = await resolveArtifactRoot(projectContext, true);
        const candidate = resolveSharePathInWorkspace(authenticatedRoot, share.artifactPath);
        const stat = await fs.stat(candidate.absolutePath).catch(() => null);
        if (stat?.isFile()) {
          return authenticatedRoot;
        }
      } catch {
        // 公开链接允许无登录访问；登录上下文不可用时继续查找 Runner 私有绑定。
      }
    }
    const boundRoot = await findArtifactShareRoot(workspaceRoot, share);
    if (boundRoot) {
      const candidate = resolveSharePathInWorkspace(boundRoot, share.artifactPath);
      const stat = await fs.stat(candidate.absolutePath).catch(() => null);
      if (stat?.isFile()) {
        return boundRoot;
      }
    }
    const candidate = resolveSharePathInWorkspace(workspaceRoot, share.artifactPath);
    const stat = await fs.stat(candidate.absolutePath).catch(() => null);
    if (stat?.isFile()) {
      return workspaceRoot;
    }
    throw localServiceError('B70081', '分享产物当前不可读取');
  }

  async function resolvePublicShare(context: LocalRequestContext, token: string): Promise<ArtifactSharePayload> {
    return centerPublicRequest<ArtifactSharePayload>(
      context,
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}`
    );
  }

  async function resolveWorkflowStore(context: LocalRequestContext, required = false): Promise<{ root: string; repository: WorkflowRepository }> {
    const root = await resolveArtifactRoot(context, required);
    return {
      root,
      repository: root === workspaceRoot ? fallbackRepository : new WorkflowRepository(root)
    };
  }

  async function loadMergedWorkflow(context: LocalRequestContext, requirementId: string, requiredRoot = false): Promise<{
    root: string;
    repository: WorkflowRepository;
    workflow: RequirementWorkflow | null;
  }> {
    const store = await resolveWorkflowStore(context, requiredRoot);
    const localWorkflow = await store.repository.load(requirementId);
    const centerWorkflow = await loadCenterRequirementWorkflow(context, requirementId).catch(() => null);
    const workflow = centerWorkflow ? mergeRequirementWorkflow(centerWorkflow, localWorkflow) : localWorkflow;
    return {
      ...store,
      workflow: workflow ? await mergeTechDesignInputLedgerIntoWorkflow(store.root, workflow) : workflow
    };
  }

  async function saveWithArtifacts(
    root: string,
    repository: WorkflowRepository,
    workflow: RequirementWorkflow
  ): Promise<RequirementWorkflow> {
    const artifacts = await scanRequirementArtifacts(
      root,
      workflow.requirementId,
      workflow.branchName,
      workflow.stages.IMPLEMENTATION.changeName,
      workflow.requirementType
    );
    return repository.save({
      ...workflow,
      artifacts
    });
  }

  async function refreshArtifacts(
    root: string,
    workflow: RequirementWorkflow
  ): Promise<RequirementWorkflow> {
    const artifacts = await scanRequirementArtifacts(
      root,
      workflow.requirementId,
      workflow.branchName,
      workflow.stages.IMPLEMENTATION.changeName,
      workflow.requirementType
    );
    return {
      ...workflow,
      artifacts
    };
  }

  function shouldRefreshArtifactsAfterRun(run?: RunRecord): boolean {
    return Boolean(run && ['SUCCEEDED', 'COMPLETED'].includes(run.status));
  }

  function scheduleArtifactIndexRefresh(
    root: string,
    repository: WorkflowRepository,
    workflow: RequirementWorkflow
  ): void {
    const key = `${root}:${workflow.requirementId}`;
    if (artifactRefreshJobs.has(key)) {
      return;
    }

    const job = (async () => {
      const artifacts = await scanRequirementArtifacts(
        root,
        workflow.requirementId,
        workflow.branchName,
        workflow.stages.IMPLEMENTATION.changeName,
        workflow.requirementType
      );
      const latestWorkflow = await repository.load(workflow.requirementId);
      await repository.save({
        ...(latestWorkflow || workflow),
        artifacts
      });
    })()
      .catch((error) => {
        console.warn('[requirement-detail] 后台刷新产物索引失败:', error instanceof Error ? error.message : error);
      })
      .finally(() => {
        if (artifactRefreshJobs.get(key) === job) {
          artifactRefreshJobs.delete(key);
        }
      });

    artifactRefreshJobs.set(key, job);
  }

  async function assertWritableWorkflow(context: LocalRequestContext, workflow: RequirementWorkflow): Promise<void> {
    await assertRequirementWorkspaceWritable(context, workflow);
  }

  async function assertCollaborationWritableWorkflow(context: LocalRequestContext, workflow: RequirementWorkflow): Promise<void> {
    if (!workflow.id) {
      throw new Error('缺少中心需求主键，无法检查需求协作占用');
    }
    await assertRequirementCollaborationWritable(context, workflow.id);
  }

  function requirementIdFromArtifactPath(filePath: string): string | undefined {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    return normalized.match(/^docs\/([^/]+)\//)?.[1];
  }

  return async function router(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'OPTIONS') {
      send(response, 204, {});
      return;
    }

    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const requestContext = parseLocalRequestContext(request, url);

      if (request.method === 'GET' && pathname === '/api/ai-delivery/health') {
        send(response, 200, { data: { status: 'UP', timestamp: new Date().toISOString() } });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/agents') {
        send(response, 200, { data: await listAgentProviders() });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/project-history') {
        send(response, 200, { data: await readProjectHistory(workspaceRoot, await loadCurrentProjectPaths(requestContext)) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/projects') {
        send(response, 200, { data: await listProjectsFromConfiguredPaths(workspaceRoot, await loadCurrentProjectPaths(requestContext)) });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/git-credentials/generate-local') {
        const input = await parseBody<LocalGitCredentialGenerateInput>(request);
        send(response, 200, { data: await generateLocalGitCredential(requestContext, input) });
        return;
      }

      const regenerateGitCredentialMatch = match(pathname, /^\/api\/ai-delivery\/git-credentials\/([^/]+)\/regenerate-local$/);
      if (request.method === 'POST' && regenerateGitCredentialMatch) {
        const input = await parseBody<LocalGitCredentialGenerateInput>(request);
        send(response, 200, { data: await regenerateLocalGitCredential(requestContext, regenerateGitCredentialMatch[1], input) });
        return;
      }

      const projectRepositoryCloneMatch = match(pathname, /^\/api\/ai-delivery\/projects\/([^/]+)\/repository\/clone$/);
      if (request.method === 'POST' && projectRepositoryCloneMatch) {
        const projectContext = { ...requestContext, projectId: projectRepositoryCloneMatch[1] };
        const state = await cloneProjectRepository(projectContext);
        await bootstrapProjectArtifactWorkspace(workspaceRoot, state.localRepoPath);
        send(response, 200, { data: state });
        return;
      }

      const projectRepositoryPushMatch = match(pathname, /^\/api\/ai-delivery\/projects\/([^/]+)\/repository\/push$/);
      if (request.method === 'POST' && projectRepositoryPushMatch) {
        const input = await parseBody<{ message?: string }>(request);
        const state = await commitAndPushProjectRepository({ ...requestContext, projectId: projectRepositoryPushMatch[1] }, input);
        send(response, 200, { data: state });
        return;
      }

      const projectRepositorySyncMatch = match(pathname, /^\/api\/ai-delivery\/projects\/([^/]+)\/repository\/sync$/);
      if (request.method === 'POST' && projectRepositorySyncMatch) {
        const projectContext = { ...requestContext, projectId: projectRepositorySyncMatch[1] };
        const state = await syncProjectRepository(projectContext);
        send(response, 200, { data: state });
        return;
      }

      const projectSkillsUpdateMatch = match(pathname, /^\/api\/ai-delivery\/projects\/([^/]+)\/skills\/update$/);
      if (request.method === 'POST' && projectSkillsUpdateMatch) {
        const projectContext = { ...requestContext, projectId: projectSkillsUpdateMatch[1] };
        const beforeState = await readProjectRepositoryStatus(projectContext);
        if (beforeState.syncStatus === 'NOT_CLONED') {
          throw new Error('项目产物仓尚未 Clone，请先 Clone 后再更新 Skill');
        }
        const bootstrap = await bootstrapProjectArtifactWorkspace(workspaceRoot, beforeState.localRepoPath);
        const state = await readProjectRepositoryStatus(projectContext);
        send(response, 200, { data: { bootstrap, state } });
        return;
      }

      const projectRepositoryStatusRefreshMatch = match(pathname, /^\/api\/ai-delivery\/projects\/([^/]+)\/repository\/status\/refresh$/);
      if (request.method === 'POST' && projectRepositoryStatusRefreshMatch) {
        send(response, 200, { data: await inspectProjectRepository({ ...requestContext, projectId: projectRepositoryStatusRefreshMatch[1] }) });
        return;
      }

      const projectRepositoryStatusMatch = match(pathname, /^\/api\/ai-delivery\/projects\/([^/]+)\/repository\/status$/);
      if (request.method === 'GET' && projectRepositoryStatusMatch) {
        send(response, 200, { data: await readProjectRepositoryStatus({ ...requestContext, projectId: projectRepositoryStatusMatch[1] }) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/settings') {
        send(response, 200, { data: await loadSettings(workspaceRoot) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/migration/plan') {
        send(response, 200, { data: await buildBootstrapImportPlan(workspaceRoot) });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/migration/import') {
        const input = await parseBody<BootstrapImportConfig & { dryRun?: boolean }>(request);
        const plan = await buildBootstrapImportPlan(workspaceRoot);
        if (input.dryRun) {
          send(response, 200, { data: plan });
          return;
        }
        send(response, 200, {
          data: await importBootstrapPlan(plan, {
            ...input,
            centerBaseUrl: input.centerBaseUrl || requestContext.centerBaseUrl || 'http://127.0.0.1:8728',
            projectId: input.projectId || requestContext.projectId || '',
            clientSessionId: input.clientSessionId || requestContext.clientSessionId,
            userId: input.userId || requestContext.userId,
            accessToken: input.accessToken || requestContext.accessToken,
            workspaceRoot
          })
        });
        return;
      }

      if (request.method === 'PUT' && pathname === '/api/ai-delivery/settings') {
        const settings = await parseBody<{ projectPaths: string[] }>(request);
        const error = validateSettings(settings);
        if (error) {
          send(response, 400, { message: error });
          return;
        }
        send(response, 200, { data: await saveSettings(workspaceRoot, settings) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/memory/cards') {
        const { root } = await resolveWorkflowStore(requestContext);
        const repository = new MemoryRepository(root);
        const status = url.searchParams.getAll('status');
        send(response, 200, {
          data: await repository.listCards({
            projectId: url.searchParams.get('projectId') || requestContext.projectId,
            status: (status.length ? status : url.searchParams.get('status')) as any,
            type: url.searchParams.get('type') as any,
            keyword: url.searchParams.get('keyword') || '',
            module: url.searchParams.get('module') || '',
            stage: url.searchParams.get('stage') as any,
            page: Number(url.searchParams.get('page') || 1),
            pageSize: Number(url.searchParams.get('pageSize') || 50)
          })
        });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/memory/cards') {
        const { root } = await resolveWorkflowStore(requestContext, true);
        const input = await parseBody<MemoryCardCreateInput>(request);
        send(response, 200, {
          data: await new MemoryRepository(root).createManualCard({
            ...input,
            projectId: input.projectId || requestContext.projectId
          })
        });
        return;
      }

      const memoryCardMatch = match(pathname, /^\/api\/ai-delivery\/memory\/cards\/([^/]+)$/);
      if (request.method === 'GET' && memoryCardMatch) {
        const { root } = await resolveWorkflowStore(requestContext);
        send(response, 200, { data: await new MemoryRepository(root).getCard(decodeURIComponent(memoryCardMatch[1])) });
        return;
      }

      if (request.method === 'POST' && memoryCardMatch) {
        const { root } = await resolveWorkflowStore(requestContext, true);
        const input = await parseBody<MemoryCardUpdateInput>(request);
        send(response, 200, { data: await new MemoryRepository(root).updateCard(decodeURIComponent(memoryCardMatch[1]), input) });
        return;
      }

      const memoryCardRevisionsMatch = match(pathname, /^\/api\/ai-delivery\/memory\/cards\/([^/]+)\/revisions$/);
      if (request.method === 'GET' && memoryCardRevisionsMatch) {
        const { root } = await resolveWorkflowStore(requestContext);
        send(response, 200, { data: await new MemoryRepository(root).listCardRevisions(decodeURIComponent(memoryCardRevisionsMatch[1])) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/memory/candidates') {
        const { root } = await resolveWorkflowStore(requestContext);
        const repository = new MemoryRepository(root);
        const status = url.searchParams.getAll('status');
        send(response, 200, {
          data: await repository.listCandidates({
            projectId: url.searchParams.get('projectId') || requestContext.projectId,
            requirementId: url.searchParams.get('requirementId') || undefined,
            status: (status.length ? status : url.searchParams.get('status')) as any,
            keyword: url.searchParams.get('keyword') || '',
            page: Number(url.searchParams.get('page') || 1),
            pageSize: Number(url.searchParams.get('pageSize') || 50)
          })
        });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/memory/candidates/extract') {
        const input = await parseBody<{ requirementId: string; runId?: string }>(request);
        const { root, workflow } = await loadMergedWorkflow(requestContext, input.requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const run = input.runId
          ? workflow.runs.find((item) => item.id === input.runId)
          : workflow.runs.find((item) => item.actionType === 'DESIGN_GENERATE' && ['SUCCEEDED', 'COMPLETED'].includes(item.status));
        if (!run) {
          send(response, 400, { message: '未找到可提炼候选经验的技术方案生成记录' });
          return;
        }
        send(response, 200, { data: await extractMemoryCandidatesForDesignRun(root, workflow, run, requestContext.projectId) });
        return;
      }

      const memoryCandidateUpdateMatch = match(pathname, /^\/api\/ai-delivery\/memory\/candidates\/([^/]+)$/);
      if (request.method === 'POST' && memoryCandidateUpdateMatch) {
        const { root } = await resolveWorkflowStore(requestContext, true);
        const input = await parseBody<MemoryCandidateUpdateInput>(request);
        send(response, 200, { data: await new MemoryRepository(root).updateCandidate(decodeURIComponent(memoryCandidateUpdateMatch[1]), input) });
        return;
      }

      const memoryCandidateConfirmMatch = match(pathname, /^\/api\/ai-delivery\/memory\/candidates\/([^/]+)\/confirm$/);
      if (request.method === 'POST' && memoryCandidateConfirmMatch) {
        const { root } = await resolveWorkflowStore(requestContext, true);
        const input = await parseBody<MemoryCandidateConfirmInput>(request);
        send(response, 200, { data: await new MemoryRepository(root).confirmCandidate(decodeURIComponent(memoryCandidateConfirmMatch[1]), input) });
        return;
      }

      const memoryCandidateIgnoreMatch = match(pathname, /^\/api\/ai-delivery\/memory\/candidates\/([^/]+)\/ignore$/);
      if (request.method === 'POST' && memoryCandidateIgnoreMatch) {
        const { root } = await resolveWorkflowStore(requestContext, true);
        const input = await parseBody<{ reason?: string }>(request);
        send(response, 200, { data: await new MemoryRepository(root).updateCandidateStatus(decodeURIComponent(memoryCandidateIgnoreMatch[1]), 'IGNORED', input.reason) });
        return;
      }

      const memoryCandidateStatusMatch = match(pathname, /^\/api\/ai-delivery\/memory\/candidates\/([^/]+)\/status$/);
      if (request.method === 'POST' && memoryCandidateStatusMatch) {
        const { root } = await resolveWorkflowStore(requestContext, true);
        const input = await parseBody<{ status: any; reason?: string }>(request);
        send(response, 200, { data: await new MemoryRepository(root).updateCandidateStatus(decodeURIComponent(memoryCandidateStatusMatch[1]), input.status, input.reason) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/memory/recalls') {
        const { root } = await resolveWorkflowStore(requestContext);
        send(response, 200, {
          data: await new MemoryRepository(root).listRecallRecords({
            projectId: url.searchParams.get('projectId') || requestContext.projectId,
            requirementId: url.searchParams.get('requirementId') || undefined,
            memoryId: url.searchParams.get('memoryId') || undefined,
            page: Number(url.searchParams.get('page') || 1),
            pageSize: Number(url.searchParams.get('pageSize') || 50)
          })
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/memory/search-config') {
        send(response, 200, { data: defaultMemorySearchConfig() });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/memory/search-config') {
        const input = await parseBody<Partial<MemorySearchConfig>>(request);
        send(response, 200, { data: mergeMemorySearchConfig(input) });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/memory/embeddings/rebuild') {
        const input = await parseBody<{ config?: Partial<MemorySearchConfig> }>(request);
        const { root } = await resolveWorkflowStore(requestContext, true);
        const repository = new MemoryRepository(root);
        const cards = await repository.listAllCards({ projectId: requestContext.projectId });
        send(response, 200, {
          data: await rebuildMemoryEmbeddingIndex(root, cards, mergeMemorySearchConfig(input.config || {}))
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/requirements') {
        const { root, repository } = await resolveWorkflowStore(requestContext);
        let workflows: RequirementWorkflow[];
        try {
          const centerWorkflows = await listCenterRequirementWorkflows(requestContext);
          workflows = await Promise.all(centerWorkflows.map(async (centerWorkflow) => {
            const localWorkflow = await repository.load(centerWorkflow.requirementId);
            const merged = await mergeTechDesignInputLedgerIntoWorkflow(root, mergeRequirementWorkflow(centerWorkflow, localWorkflow));
            if (!localWorkflow) {
              return merged;
            }
            const refreshed = await refreshTerminalRunStatuses(root, merged, centerRunnerConfig(requestContext));
            const finalized = await finalizeSuccessfulTechDesignRuns(root, refreshed.workflow, requestContext);
            await finalizeSuccessfulTechDesignMemoryFeedback(root, finalized.workflow, requestContext);
            const retrospectiveFinalized = await finalizeSuccessfulRetrospectiveRuns(root, finalized.workflow, requestContext);
            await retryWorkflowTokenUsageOutboxes(root, retrospectiveFinalized.workflow, centerRunnerConfig(requestContext));
            await retryWorkflowCenterRunStatuses(retrospectiveFinalized.workflow, centerRunnerConfig(requestContext));
            return saveWithArtifacts(root, repository, retrospectiveFinalized.workflow);
          }));
        } catch {
          workflows = await Promise.all((await repository.list()).map(async (workflow) => {
            const merged = await mergeTechDesignInputLedgerIntoWorkflow(root, workflow);
            const refreshed = await refreshTerminalRunStatuses(root, merged, centerRunnerConfig(requestContext));
            const finalized = await finalizeSuccessfulTechDesignRuns(root, refreshed.workflow, requestContext);
            await finalizeSuccessfulTechDesignMemoryFeedback(root, finalized.workflow, requestContext);
            const retrospectiveFinalized = await finalizeSuccessfulRetrospectiveRuns(root, finalized.workflow, requestContext);
            return refreshed.changed || finalized.changed || retrospectiveFinalized.changed
              ? saveWithArtifacts(root, repository, retrospectiveFinalized.workflow)
              : retrospectiveFinalized.workflow;
          }));
        }
        send(response, 200, { data: workflows });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/requirements') {
        const input = await parseBody<RequirementInput>(request);
        const projectPaths = input.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
        const { root, repository } = await resolveWorkflowStore(requestContext);
        const centerWorkflow = requestContext.projectId
          ? await upsertCenterRequirement(requestContext, input)
          : undefined;
        let workflow = await repository.upsert({
          ...input,
          id: centerWorkflow?.id ?? input.id
        }, projectPaths);
        workflow = await saveWithArtifacts(root, repository, workflow);
        await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
        send(response, 200, { data: workflow });
        return;
      }

      const requirementMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)$/);
      if (request.method === 'GET' && requirementMatch) {
        const store = await resolveWorkflowStore(requestContext);
        const localWorkflow = await store.repository.load(requirementMatch[1]);
        const centerWorkflow = localWorkflow
          ? await loadCachedCenterRequirementWorkflow(requestContext, requirementMatch[1], { timeoutMs: 800 }).catch(() => undefined)
          : await loadCenterRequirementWorkflow(requestContext, requirementMatch[1]).catch(() => null);
        let workflow = centerWorkflow ? mergeRequirementWorkflow(centerWorkflow, localWorkflow) : localWorkflow;
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        workflow = await mergeTechDesignInputLedgerIntoWorkflow(store.root, workflow);
        const refreshed = await refreshTerminalRunStatuses(store.root, workflow, centerRunnerConfig(requestContext));
        const finalized = await finalizeSuccessfulTechDesignRuns(store.root, refreshed.workflow, requestContext);
        await finalizeSuccessfulTechDesignMemoryFeedback(store.root, finalized.workflow, requestContext);
        const retrospectiveFinalized = await finalizeSuccessfulRetrospectiveRuns(store.root, finalized.workflow, requestContext);
        workflow = retrospectiveFinalized.workflow;
        const outboxChanged = await retryWorkflowTokenUsageOutboxes(store.root, workflow, centerRunnerConfig(requestContext));
        const centerStatusChanged = await retryWorkflowCenterRunStatuses(workflow, centerRunnerConfig(requestContext));
        if (refreshed.changed || finalized.changed || retrospectiveFinalized.changed || outboxChanged || centerStatusChanged) {
          workflow = await store.repository.save(workflow);
        }
        send(response, 200, { data: workflow });
        scheduleArtifactIndexRefresh(store.root, store.repository, workflow);
        scheduleRequirementWorkspaceStateReport(requestContext, workflow);
        return;
      }

      const visualContextCandidatesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/openspec-visual-context-candidates$/);
      if (request.method === 'GET' && visualContextCandidatesMatch) {
        const requirementId = visualContextCandidatesMatch[1];
        const { root } = await resolveWorkflowStore(requestContext);
        const workflow = (await loadMergedWorkflow(requestContext, requirementId)).workflow;
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: { candidates: await listOpenSpecVisualContextCandidates(root, workflow) } });
        return;
      }

      const supplementInputsMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/supplement-inputs$/);
      if ((request.method === 'POST' || request.method === 'PATCH') && supplementInputsMatch) {
        const requirementId = supplementInputsMatch[1];
        const input = await parseBody<SupplementInputsUpdate>(request);
        const { root, repository } = await resolveWorkflowStore(requestContext);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertCollaborationWritableWorkflow(requestContext, workflow);
          const nextWorkflow: RequirementWorkflow = {
            ...workflow,
            prdClarification: hasBodyField(input, 'prdClarification') ? input.prdClarification || '' : workflow.prdClarification,
            prdSupplementBlocks: hasBodyField(input, 'prdSupplementBlocks')
              ? normalizeSupplementBlocksInput(input.prdSupplementBlocks)
              : workflow.prdSupplementBlocks || [],
            prdClarificationBlocks: hasBodyField(input, 'prdClarificationBlocks')
              ? normalizeSupplementBlocksInput(input.prdClarificationBlocks)
              : workflow.prdClarificationBlocks || [],
            techDesignClarification: hasBodyField(input, 'techDesignClarification') ? input.techDesignClarification || '' : workflow.techDesignClarification,
            techDesignSupplementBlocks: hasBodyField(input, 'techDesignSupplementBlocks')
              ? normalizeSupplementBlocksInput(input.techDesignSupplementBlocks)
              : workflow.techDesignSupplementBlocks || [],
            openSpecArtifactAdjustment: hasBodyField(input, 'openSpecArtifactAdjustment')
              ? input.openSpecArtifactAdjustment || ''
              : workflow.openSpecArtifactAdjustment,
            openSpecSupplementBlocks: hasBodyField(input, 'openSpecSupplementBlocks')
              ? normalizeSupplementBlocksInput(input.openSpecSupplementBlocks)
              : workflow.openSpecSupplementBlocks || [],
            openSpecVisualContextPaths: hasBodyField(input, 'openSpecVisualContextPaths')
              ? uniqueNormalizedPaths(input.openSpecVisualContextPaths || [])
              : workflow.openSpecVisualContextPaths || []
          };
          workflow = await repository.save(nextWorkflow);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const retrospectiveMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/retrospective$/);
      if (request.method === 'GET' && retrospectiveMatch) {
        const { root, workflow } = await loadMergedWorkflow(requestContext, retrospectiveMatch[1], true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: await getRetrospectiveSummary(root, workflow, requestContext.projectId ? String(requestContext.projectId) : undefined) });
        return;
      }

      const openSpecSummaryMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/openspec-summary$/);
      if (request.method === 'GET' && openSpecSummaryMatch) {
        const { root, workflow } = await loadMergedWorkflow(requestContext, openSpecSummaryMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
        const changeName = normalizeOpenSpecChangeName(url.searchParams.get('changeName') || fallbackChangeName, fallbackChangeName);
        send(response, 200, { data: await readOpenSpecSummary(root, changeName, fallbackChangeName) });
        return;
      }

      const openSpecTaskMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/openspec-tasks$/);
      if (request.method === 'POST' && openSpecTaskMatch) {
        const requirementId = openSpecTaskMatch[1];
        const input = await parseBody<{ changeName?: string; line: number; completed: boolean; raw?: string }>(request);
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          const workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertCollaborationWritableWorkflow(requestContext, workflow);
          const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
          const changeName = normalizeOpenSpecChangeName(input.changeName || fallbackChangeName, fallbackChangeName);
          const summary = await updateOpenSpecTaskStatus(root, changeName, fallbackChangeName, Number(input.line), Boolean(input.completed), input.raw);
          send(response, 200, { data: summary });
        } finally {
          await lock.release();
        }
        return;
      }

      const gitDiffPreviewMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/git-changes\/diff$/);
      if (request.method === 'GET' && gitDiffPreviewMatch) {
        const { root, workflow } = await loadMergedWorkflow(requestContext, gitDiffPreviewMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const input: GitDiffQueryInput = {
          projectPath: url.searchParams.get('projectPath') || '',
          filePath: url.searchParams.get('filePath') || undefined,
          contextLines: Number(url.searchParams.get('contextLines') || 3)
        };
        send(response, 200, { data: await readGitDiffPreview(root, workflow.projects || [], input, await loadCurrentProjectPaths(requestContext, true)) });
        return;
      }

      const gitFilePreviewMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/git-changes\/file$/);
      if (request.method === 'GET' && gitFilePreviewMatch) {
        const { root, workflow } = await loadMergedWorkflow(requestContext, gitFilePreviewMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const input: GitDiffQueryInput = {
          projectPath: url.searchParams.get('projectPath') || '',
          filePath: url.searchParams.get('filePath') || undefined,
          focusLine: Number(url.searchParams.get('focusLine') || 0) || undefined
        };
        send(response, 200, { data: await readGitChangedFilePreview(root, workflow.projects || [], input, await loadCurrentProjectPaths(requestContext, true)) });
        return;
      }

      const gitChangesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/git-changes$/);
      if (request.method === 'GET' && gitChangesMatch) {
        const { root, workflow } = await loadMergedWorkflow(requestContext, gitChangesMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: await readGitChanges(root, workflow.projects || [], workflow.branchName, await loadCurrentProjectPaths(requestContext, true)) });
        return;
      }

      const aiCompletenessMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/ai-completeness$/);
      if (request.method === 'GET' && aiCompletenessMatch) {
        const { workflow } = await loadMergedWorkflow(requestContext, aiCompletenessMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: await buildAiCodeCompletenessState(workflow) });
        return;
      }

      const aiCompletenessCalculateMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/ai-completeness\/calculate$/);
      if (request.method === 'POST' && aiCompletenessCalculateMatch) {
        const requirementId = aiCompletenessCalculateMatch[1];
        const input = await parseBody<AiCodeCompletenessInput>(request);
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const projectPaths = workflow.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
          const { state, result } = await calculateAiCodeCompleteness(root, workflow, input, projectPaths);
          workflow = {
            ...workflow,
            aiCodeCompleteness: state
          };
          workflow = await saveWithArtifacts(root, repository, workflow);
          send(response, 200, { data: { result, workflow } });
        } finally {
          await lock.release();
        }
        return;
      }

      const aiCompletenessCaptureMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/ai-completeness\/capture-ai-commit$/);
      if (request.method === 'POST' && aiCompletenessCaptureMatch) {
        const requirementId = aiCompletenessCaptureMatch[1];
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const projectPaths = workflow.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
          workflow = {
            ...workflow,
            aiCodeCompleteness: await captureRemoteAiCommits(root, workflow, projectPaths)
          };
          workflow = await repository.save(workflow);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const artifactGitSyncPlanMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/artifact-git-syncs\/plan$/);
      if (request.method === 'POST' && artifactGitSyncPlanMatch) {
        const { workflow } = await loadMergedWorkflow(requestContext, artifactGitSyncPlanMatch[1], true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        await assertWritableWorkflow(requestContext, workflow);
        const input = await parseBody<ArtifactGitSyncPlanInput>(request);
        send(response, 200, { data: await buildArtifactGitSyncPlan(requestContext, workflow, input) });
        return;
      }

      const artifactGitSyncConfirmMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/artifact-git-syncs\/confirm$/);
      if (request.method === 'POST' && artifactGitSyncConfirmMatch) {
        const { workflow } = await loadMergedWorkflow(requestContext, artifactGitSyncConfirmMatch[1], true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        await assertWritableWorkflow(requestContext, workflow);
        const input = await parseBody<ArtifactGitSyncConfirmInput>(request);
        const result = await confirmArtifactGitSync(requestContext, workflow, input);
        await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
        send(response, 200, { data: result });
        return;
      }

      const stageUntrackedMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/git-changes\/stage-untracked$/);
      if (request.method === 'POST' && stageUntrackedMatch) {
        const { root, workflow } = await loadMergedWorkflow(requestContext, stageUntrackedMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        await assertWritableWorkflow(requestContext, workflow);
        const input = await parseBody<GitStageUntrackedInput>(request);
        send(response, 200, { data: await stageUntrackedFiles(root, workflow.projects || [], workflow.branchName, input, await loadCurrentProjectPaths(requestContext, true)) });
        return;
      }

      const prdFilesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/prd-files$/);
      if (request.method === 'POST' && prdFilesMatch) {
        const requirementId = prdFilesMatch[1];
        const files = await parseMultipartFiles(request);
        if (!files.length) {
          send(response, 400, { message: '请至少选择一个 PRD 来源文件' });
          return;
        }
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertCollaborationWritableWorkflow(requestContext, workflow);
          files.forEach(assertAllowedPrdSourceFile);
          const snapshots: PrdSourceFile[] = [];
          for (const file of files) {
            snapshots.push(await savePrdSourceFileSnapshot(root, workflow.requirementId, file));
          }
          const sources = new Set([...workflow.sources, ...snapshots.map((file) => file.path)]);
          workflow = await repository.save({
            ...workflow,
            prdSourceFiles: [...(workflow.prdSourceFiles || []), ...snapshots],
            sources: [...sources]
          });
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const prdFileDeleteMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/prd-files\/([^/]+)$/);
      if (request.method === 'DELETE' && prdFileDeleteMatch) {
        const requirementId = prdFileDeleteMatch[1];
        const fileId = decodeURIComponent(prdFileDeleteMatch[2]);
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertCollaborationWritableWorkflow(requestContext, workflow);
          workflow = await repository.save(await deletePrdSourceFileSnapshot(root, workflow, fileId));
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignFilesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-files$/);
      if (request.method === 'POST' && techDesignFilesMatch) {
        const requirementId = techDesignFilesMatch[1];
        const files = await parseMultipartFiles(request);
        if (!files.length) {
          send(response, 400, { message: '请至少选择一个技术方案补充材料' });
          return;
        }
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertCollaborationWritableWorkflow(requestContext, workflow);
          files.forEach(assertAllowedPrdSourceFile);
          const snapshots: TechDesignSourceFile[] = [];
          for (const file of files) {
            snapshots.push(await saveTechDesignSourceFileSnapshot(root, workflow.requirementId, file));
          }
          const nextWorkflow = {
            ...workflow,
            techDesignSourceFiles: [...(workflow.techDesignSourceFiles || []), ...snapshots]
          };
          workflow = await saveWithArtifacts(root, repository, nextWorkflow);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignFileDeleteMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-files\/([^/]+)$/);
      if (request.method === 'DELETE' && techDesignFileDeleteMatch) {
        const requirementId = techDesignFileDeleteMatch[1];
        const fileId = decodeURIComponent(techDesignFileDeleteMatch[2]);
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertCollaborationWritableWorkflow(requestContext, workflow);
          const nextWorkflow = await deleteTechDesignSourceFileSnapshot(root, workflow, fileId);
          workflow = await saveWithArtifacts(root, repository, nextWorkflow);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignQuestionDeleteMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-questions$/);
      if (request.method === 'DELETE' && techDesignQuestionDeleteMatch) {
        const requirementId = techDesignQuestionDeleteMatch[1];
        const input = await parseBody<DeleteTechDesignQuestionInput>(request);
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
//          await assertWritableWorkflow(requestContext, workflow);
          const nextWorkflow = await deleteTechDesignQuestionRecord(root, workflow, input);
          workflow = await saveWithArtifacts(root, repository, nextWorkflow);
//          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignVersionDiffMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-versions\/diff$/);
      if (request.method === 'POST' && techDesignVersionDiffMatch) {
        const requirementId = techDesignVersionDiffMatch[1];
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const input = await parseBody<{ leftVersionId: string; rightVersionId: string }>(request);
        send(response, 200, { data: await diffTechDesignVersions(root, requirementId, input) });
        return;
      }

      const techDesignVersionContentMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-versions\/([^/]+)$/);
      if (request.method === 'GET' && techDesignVersionContentMatch) {
        const requirementId = techDesignVersionContentMatch[1];
        const versionId = decodeURIComponent(techDesignVersionContentMatch[2]);
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: await readTechDesignVersionContent(root, requirementId, versionId) });
        return;
      }

      const techDesignVersionsMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-versions$/);
      if (request.method === 'GET' && techDesignVersionsMatch) {
        const requirementId = techDesignVersionsMatch[1];
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: { versions: await listTechDesignVersions(root, requirementId) } });
        return;
      }

      const techDesignAnnotationStatusMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-annotations\/([^/]+)\/status$/);
      if (request.method === 'POST' && techDesignAnnotationStatusMatch) {
        const requirementId = techDesignAnnotationStatusMatch[1];
        const annotationId = decodeURIComponent(techDesignAnnotationStatusMatch[2]);
        const input = await parseBody<{ status?: any; includeInNextGeneration?: boolean; expectedHash?: string }>(request);
        const loaded = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!loaded.workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, loaded.workflow)) {
          send(response, 200, { data: await updateCenterTechDesignAnnotationStatus(requestContext, loaded.workflow, annotationId, input) });
          return;
        }
        const { root, repository } = loaded;
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = loaded.workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const result = await updateTechDesignAnnotationStatus(root, requirementId, annotationId, input);
          workflow = await saveWithArtifacts(root, repository, workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: result });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignAnnotationDeleteMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-annotations\/([^/]+)\/delete$/);
      if (request.method === 'POST' && techDesignAnnotationDeleteMatch) {
        const requirementId = techDesignAnnotationDeleteMatch[1];
        const annotationId = decodeURIComponent(techDesignAnnotationDeleteMatch[2]);
        const input = await parseBody<{ expectedHash?: string }>(request);
        const loaded = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!loaded.workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, loaded.workflow)) {
          send(response, 200, { data: await deleteCenterTechDesignAnnotation(requestContext, loaded.workflow, annotationId) });
          return;
        }
        const { root, repository } = loaded;
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = loaded.workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const result = await deleteTechDesignAnnotation(root, requirementId, annotationId, input);
          workflow = await saveWithArtifacts(root, repository, workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: result });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignAnnotationReplyMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-annotations\/([^/]+)\/replies$/);
      if (request.method === 'POST' && techDesignAnnotationReplyMatch) {
        const requirementId = techDesignAnnotationReplyMatch[1];
        const annotationId = decodeURIComponent(techDesignAnnotationReplyMatch[2]);
        const input = await parseBody<{ content?: string; expectedHash?: string }>(request);
        const loaded = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!loaded.workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, loaded.workflow)) {
          send(response, 200, { data: await createCenterTechDesignAnnotationReply(requestContext, loaded.workflow, annotationId, input as any) });
          return;
        }
        const { root, repository } = loaded;
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = loaded.workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const result = await createTechDesignAnnotationReply(root, requirementId, annotationId, input as any);
          workflow = await saveWithArtifacts(root, repository, workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: result });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignAnnotationReplyDeleteMatch = match(
        pathname,
        /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-annotations\/([^/]+)\/replies\/([^/]+)\/delete$/
      );
      if (request.method === 'POST' && techDesignAnnotationReplyDeleteMatch) {
        const requirementId = techDesignAnnotationReplyDeleteMatch[1];
        const annotationId = decodeURIComponent(techDesignAnnotationReplyDeleteMatch[2]);
        const replyId = decodeURIComponent(techDesignAnnotationReplyDeleteMatch[3]);
        const input = await parseBody<{ expectedHash?: string }>(request);
        const loaded = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!loaded.workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, loaded.workflow)) {
          send(response, 200, { data: await deleteCenterTechDesignAnnotationReply(requestContext, loaded.workflow, annotationId, replyId) });
          return;
        }
        const { root, repository } = loaded;
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = loaded.workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const result = await deleteTechDesignAnnotationReply(root, requirementId, annotationId, replyId, input);
          workflow = await saveWithArtifacts(root, repository, workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: result });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignAnnotationRebuildMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-annotations\/rebuild-summary$/);
      if (request.method === 'POST' && techDesignAnnotationRebuildMatch) {
        const requirementId = techDesignAnnotationRebuildMatch[1];
        const loaded = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!loaded.workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, loaded.workflow)) {
          send(response, 200, { data: await listCenterTechDesignAnnotations(requestContext, loaded.workflow) });
          return;
        }
        const { root, repository } = loaded;
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = loaded.workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const result = await rebuildTechDesignAnnotationSummary(root, requirementId);
          workflow = await saveWithArtifacts(root, repository, workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: result });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignAnnotationsMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-annotations$/);
      if (request.method === 'GET' && techDesignAnnotationsMatch) {
        const requirementId = techDesignAnnotationsMatch[1];
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, workflow)) {
          send(response, 200, { data: await listCenterTechDesignAnnotations(requestContext, workflow, url.searchParams.get('versionId') || undefined) });
          return;
        }
        send(response, 200, { data: await listTechDesignAnnotations(root, requirementId) });
        return;
      }
      if (request.method === 'POST' && techDesignAnnotationsMatch) {
        const requirementId = techDesignAnnotationsMatch[1];
        const input = await parseBody<any>(request);
        const loaded = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!loaded.workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        if (centerTechDesignAnnotationsEnabled(requestContext, loaded.workflow)) {
          send(response, 200, { data: await createCenterTechDesignAnnotation(loaded.root, requestContext, loaded.workflow, input) });
          return;
        }
        const { root, repository } = loaded;
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = loaded.workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          const result = await createTechDesignAnnotation(root, requirementId, input);
          workflow = await saveWithArtifacts(root, repository, workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: result });
        } finally {
          await lock.release();
        }
        return;
      }

      const requirementMemoryRecallMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/memory\/recall$/);
      if (request.method === 'POST' && requirementMemoryRecallMatch) {
        const requirementId = requirementMemoryRecallMatch[1];
        const input = await parseBody<{ actionType?: ActionInput['actionType']; runId?: string; stage?: any }>(request);
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const runId = input.runId || `manual-${Date.now()}`;
        send(response, 200, {
          data: await prepareMemoryRecallForRun(root, workflow, {
            projectId: requestContext.projectId,
            actionType: input.actionType || 'DESIGN_GENERATE',
            stage: input.stage || workflow.currentStage,
            runId
          })
        });
        return;
      }

      const requirementMemoryRecallPreviewMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/memory\/recall-preview$/);
      if (request.method === 'POST' && requirementMemoryRecallPreviewMatch) {
        const requirementId = requirementMemoryRecallPreviewMatch[1];
        const input = await parseBody<{
          actionType?: ActionInput['actionType'];
          stage?: any;
          sourceFilePaths?: string[];
          clarification?: string;
          runIntent?: string;
        }>(request);
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, {
          data: await previewMemoryRecallForRun(root, workflow, {
            projectId: requestContext.projectId,
            actionType: input.actionType || 'DESIGN_GENERATE',
            stage: input.stage || workflow.currentStage,
            sourceFilePaths: Array.isArray(input.sourceFilePaths) ? input.sourceFilePaths : [],
            clarification: typeof input.clarification === 'string' ? input.clarification : '',
            runIntent: typeof input.runIntent === 'string' ? input.runIntent : ''
          })
        });
        return;
      }

      const requirementMemoryRecallConfirmMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/memory\/recall-confirm$/);
      if (request.method === 'POST' && requirementMemoryRecallConfirmMatch) {
        const requirementId = requirementMemoryRecallConfirmMatch[1];
        const input = await parseBody<MemoryRecallConfirmInput>(request);
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, {
          data: await confirmMemoryRecallForRun(root, workflow, {
            projectId: requestContext.projectId,
            actionType: input.actionType || 'DESIGN_GENERATE',
            stage: input.stage || workflow.currentStage,
            runId: input.runId || `manual-${Date.now()}`,
            previewId: input.previewId,
            selectedMemoryIds: input.selectedMemoryIds || [],
            dismissed: input.dismissed || [],
            force: input.force,
            sourceFilePaths: Array.isArray(input.sourceFilePaths) ? input.sourceFilePaths : [],
            clarification: typeof input.clarification === 'string' ? input.clarification : '',
            runIntent: typeof input.runIntent === 'string' ? input.runIntent : ''
          })
        });
        return;
      }

      const actionMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/actions$/);
      if (request.method === 'POST' && actionMatch) {
        const requirementId = actionMatch[1];
        const action = await parseBody<ActionInput>(request);
        let effectiveAction = action;
        if (action.params?.executionMode === 'MANUAL_COPY') {
          send(response, 400, { message: '手动复制执行方式请使用命令预览接口' });
          return;
        }
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          if (action.actionType === 'PRD_ANALYZE') {
            const params = action.params || {};
            const sources = Array.isArray(params.sources)
              ? params.sources.map((item) => String(item).trim()).filter(Boolean)
              : workflow.sources;
            workflow = {
              ...workflow,
              sources,
              prdClarification: normalizePrdClarification(typeof params.description === 'string' ? params.description : workflow.prdClarification),
              prdSupplementBlocks: Array.isArray(params.supplementBlocks)
                ? normalizeSupplementBlocksInput(params.supplementBlocks)
                : workflow.prdSupplementBlocks || []
            };
          }
          if (action.actionType === 'PRD_CLARIFY') {
            await assertPrdClarificationReady(root, workflow, action);
            const params = action.params || {};
            const sources = Array.isArray(params.sources)
              ? params.sources.map((item) => String(item).trim()).filter(Boolean)
              : Array.isArray(params.sourceFiles)
                ? params.sourceFiles.map((item) => String(item).trim()).filter(Boolean)
                : [];
            workflow = {
              ...workflow,
              sources: [...new Set([...(workflow.sources || []), ...sources])],
              prdClarification: normalizePrdClarification(typeof params.description === 'string' ? params.description : ''),
              prdClarificationBlocks: Array.isArray(params.supplementBlocks)
                ? normalizeSupplementBlocksInput(params.supplementBlocks)
                : workflow.prdClarificationBlocks || []
            };
          }
          if (action.actionType === 'DESIGN_GENERATE') {
            const params = action.params || {};
            const documentPath = designDocumentPath(workflow, params);
            await createTechDesignDraftSnapshot(root, workflow.requirementId).catch(() => undefined);
            const preparedAnnotations = await prepareCenterTechDesignAnnotationInput(root, requestContext, workflow);
            const preparedAnnotationPath = preparedAnnotations?.sourceFilePath || '';
            const inputSnapshot = captureTechDesignInputSnapshot(
              workflow,
              params,
              (preparedAnnotations?.annotations || []).map((annotation) => annotation.id),
              preparedAnnotationPath ? [preparedAnnotationPath] : []
            );
            const nextParams = { ...params };
            if (preparedAnnotations?.sourceFilePath) {
              const sourceFiles = Array.isArray(params.sourceFiles)
                ? params.sourceFiles.map((item) => String(item).trim()).filter(Boolean)
                : [];
              nextParams.sourceFiles = [...sourceFiles, preparedAnnotations.sourceFilePath];
            }
            effectiveAction = {
              ...action,
              params: nextParams,
              techDesignInputSnapshot: inputSnapshot
            };
            workflow = {
              ...workflow,
              techDesignDocument: documentPath,
              techDesignClarification: typeof params.clarification === 'string' ? params.clarification : workflow.techDesignClarification,
              techDesignSupplementBlocks: Array.isArray(params.supplementBlocks)
                ? normalizeSupplementBlocksInput(params.supplementBlocks)
                : workflow.techDesignSupplementBlocks || []
            };
          }
          if (['OPENSPEC_STATUS', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_FF', 'OPENSPEC_APPLY', 'OPENSPEC_VERIFY', 'OPENSPEC_ARCHIVE'].includes(action.actionType)) {
            const params = action.params || {};
            const changeName = normalizeOpenSpecChangeName(typeof params.changeName === 'string' ? params.changeName : '', workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`);
            workflow = {
              ...workflow,
              stages: {
                ...workflow.stages,
                IMPLEMENTATION: {
                  ...workflow.stages.IMPLEMENTATION,
                  changeName
                }
              }
            };
          }
          if (action.actionType === 'OPENSPEC_FF') {
            const params = action.params || {};
            workflow = {
              ...workflow,
              openSpecArtifactAdjustment: typeof params.artifactAdjustment === 'string' ? params.artifactAdjustment : workflow.openSpecArtifactAdjustment,
              openSpecSupplementBlocks: Array.isArray(params.supplementBlocks)
                ? normalizeSupplementBlocksInput(params.supplementBlocks)
                : workflow.openSpecSupplementBlocks || []
            };
          }
          const projectPaths = workflow.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
          if (effectiveAction.actionType === 'OPENSPEC_APPLY') {
            workflow = {
              ...workflow,
              aiCodeCompleteness: await captureBaseCommits(root, workflow, projectPaths)
            };
          }
          const run = await executeAction(root, workflow, effectiveAction, async (updatedRun) => {
            const latest = await repository.load(requirementId);
            if (!latest) {
              return;
            }
            const index = latest.runs.findIndex((item) => item.id === updatedRun.id);
            if (index >= 0) {
              latest.runs[index] = updatedRun;
            } else {
              latest.runs.unshift(updatedRun);
            }
            let updatedWorkflow = applyImplementationRun(latest, updatedRun);
            updatedWorkflow = consumePrdAnalyzeInputsAfterRun(updatedWorkflow, updatedRun);
            updatedWorkflow = applyPrdClarificationRun(updatedWorkflow, updatedRun);
            updatedWorkflow = consumeOpenSpecArtifactInputsAfterRun(updatedWorkflow, updatedRun);
            if (['SUCCEEDED', 'COMPLETED'].includes(updatedRun.status)) {
              try {
                updatedWorkflow = (await finalizeSuccessfulTechDesignRuns(root, updatedWorkflow, requestContext)).workflow;
                await markMemoryRecallApplied(root, updatedWorkflow, updatedRun, requestContext.projectId);
                const retrospectiveResult = await importRetrospectiveRunOutputs(root, updatedWorkflow, updatedRun, requestContext.projectId);
                updatedWorkflow = retrospectiveResult.workflow;
                if (retrospectiveResult.parseError) {
                  await appendRunEvent(root, requirementId, updatedRun.id, {
                    type: 'WARN',
                    level: 'WARN',
                    message: retrospectiveResult.parseError,
                    agentId: updatedRun.agentId
                  });
                }
              } catch (error: any) {
                await appendRunEvent(root, requirementId, updatedRun.id, {
                  type: 'WARN',
                  level: 'WARN',
                  message: `动作成功后的产物整理失败，将在刷新时重试：${error?.message || 'unknown error'}`,
                  agentId: updatedRun.agentId
                });
              }
            }
            if (shouldRefreshArtifactsAfterRun(updatedRun)) {
              updatedWorkflow = await refreshArtifacts(root, updatedWorkflow);
            }
            await repository.save(updatedWorkflow);
          }, {
            projectPaths,
            centerConfig: centerRunnerConfig(requestContext),
            projectId: requestContext.projectId
          });
          
          const stage = run.stage || stageForAction(effectiveAction.actionType);
          if (stage) {
            await appendStageCommandLog(
              root,
              requirementId,
              stage,
              run.commandText || effectiveAction.actionType,
              {
                runId: run.id,
                actionType: run.actionType,
                implementationStep: run.implementationStep,
                agentId: run.agentId,
                status: run.status
              }
            );
          }
          workflow.runs.unshift(run);
          workflow = applyImplementationRun(workflow, run);
          workflow = consumePrdAnalyzeInputsAfterRun(workflow, run);
          workflow = await consumeTechDesignInputsAfterRun(root, workflow, run, requestContext);
          await markMemoryRecallApplied(root, workflow, run, requestContext.projectId);
          const retrospectiveResult = await importRetrospectiveRunOutputs(root, workflow, run, requestContext.projectId);
          workflow = retrospectiveResult.workflow;
          if (retrospectiveResult.parseError) {
            await appendRunEvent(root, requirementId, run.id, {
              type: 'WARN',
              level: 'WARN',
              message: retrospectiveResult.parseError,
              agentId: run.agentId
            });
          }
          if (shouldRefreshArtifactsAfterRun(run)) {
            workflow = await refreshArtifacts(root, workflow);
          }
          if (effectiveAction.actionType === 'REFRESH_ARTIFACTS') {
            workflow.artifacts = await scanRequirementArtifacts(
              root,
              workflow.requirementId,
              workflow.branchName,
              workflow.stages.IMPLEMENTATION.changeName,
              workflow.requirementType
            );
          }
          // PRD分析、技术方案生成等可能产生产物的操作，执行完成后自动刷新产物索引
          if (['PRD_ANALYZE', 'PRD_CLARIFY', 'DESIGN_GENERATE', 'DESIGN_QUESTION', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_ARCHIVE', 'RETROSPECTIVE_GENERATE'].includes(effectiveAction.actionType)) {
            workflow.artifacts = await scanRequirementArtifacts(
              root,
              workflow.requirementId,
              workflow.branchName,
              workflow.stages.IMPLEMENTATION.changeName,
              workflow.requirementType
            );
          }
          workflow = applyPrdClarificationRun(workflow, run);
          workflow = consumeOpenSpecArtifactInputsAfterRun(workflow, run);
          if (effectiveAction.actionType === 'RETURN_TO_IMPLEMENTATION') {
            const issues = await refreshCodeReviewIssues(root, workflow);
            workflow = returnToImplementation(workflow, issues);
            await new MemoryRepository(root).markRetrospectiveCandidatesPendingVerify(workflow.requirementId, '代码评审打回实施，复盘需重新确认');
          }
          workflow = await repository.save(workflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: { run, workflow } });
        } finally {
          await lock.release();
        }
        return;
      }

      const actionCommandMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/actions\/command$/);
      if (request.method === 'POST' && actionCommandMatch) {
        const requirementId = actionCommandMatch[1];
        const action = await parseBody<ActionInput>(request);
        const { root, workflow: loadedWorkflow } = await loadMergedWorkflow(requestContext, requirementId, true);
        let workflow = loadedWorkflow;
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        validateActionInput(root, action);
        const params = action.params || {};
        await assertPrdClarificationReady(root, workflow, action);
        if (action.actionType === 'DESIGN_GENERATE') {
          workflow = {
            ...workflow,
            techDesignDocument: designDocumentPath(workflow, params)
          };
        }
        if (['OPENSPEC_STATUS', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_FF', 'OPENSPEC_APPLY', 'OPENSPEC_VERIFY', 'OPENSPEC_ARCHIVE'].includes(action.actionType)) {
          const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
          const changeName = normalizeOpenSpecChangeName(typeof params.changeName === 'string' ? params.changeName : '', fallbackChangeName);
          workflow = {
            ...workflow,
            stages: {
              ...workflow.stages,
              IMPLEMENTATION: {
                ...workflow.stages.IMPLEMENTATION,
                changeName
              }
            }
          };
        }
        const effectiveAction = action.actionType === 'OPENSPEC_FF'
          ? await prepareOpenSpecArtifactAction(root, workflow, action)
          : action;
        send(response, 200, { data: { commandText: buildActionCommand(workflow, effectiveAction) } });
        return;
      }

      const runMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/events$/);
      if (request.method === 'GET' && runMatch) {
        const requirementId = url.searchParams.get('requirementId') || '';
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId);
        const run = workflow?.runs.find((item) => item.id === runMatch[1]);
        send(response, 200, { data: await readRunEventsWithTranscript(root, requirementId, runMatch[1], run?.terminalTranscriptPath, run?.terminalRawTranscriptPath) });
        return;
      }

      const runStreamMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/stream$/);
      if (request.method === 'GET' && runStreamMatch) {
        const requirementId = url.searchParams.get('requirementId') || '';
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        const tailOnly = url.searchParams.get('tail') === '1';
        const { root, repository } = await resolveWorkflowStore(requestContext);
        let sent = tailOnly ? (await readRunEvents(root, requirementId, runStreamMatch[1])).length : 0;
        const initialWorkflow = await repository.load(requirementId);
        const initialRun = initialWorkflow?.runs.find((item) => item.id === runStreamMatch[1]);
        let transcriptOffset = tailOnly ? await readTerminalTranscriptSize(root, initialRun?.terminalTranscriptPath) : 0;
        let interval: NodeJS.Timeout | undefined;
        let closed = false;
        const push = async () => {
          if (closed) {
            return;
          }
          let workflow = await repository.load(requirementId);
          if (workflow) {
            const refreshed = await refreshTerminalRunStatuses(root, workflow, centerRunnerConfig(requestContext));
            const finalized = await finalizeSuccessfulTechDesignRuns(root, refreshed.workflow, requestContext);
            await finalizeSuccessfulTechDesignMemoryFeedback(root, finalized.workflow, requestContext);
            const retrospectiveFinalized = await finalizeSuccessfulRetrospectiveRuns(root, finalized.workflow, requestContext);
            const outboxChanged = await retryWorkflowTokenUsageOutboxes(root, retrospectiveFinalized.workflow, centerRunnerConfig(requestContext));
            const centerStatusChanged = await retryWorkflowCenterRunStatuses(retrospectiveFinalized.workflow, centerRunnerConfig(requestContext));
            const currentRun = retrospectiveFinalized.workflow.runs.find((item) => item.id === runStreamMatch[1]);
            const artifactsChanged = shouldRefreshArtifactsAfterRun(currentRun);
            const workflowToSave = artifactsChanged
              ? await refreshArtifacts(root, retrospectiveFinalized.workflow)
              : retrospectiveFinalized.workflow;
            workflow = refreshed.changed || finalized.changed || retrospectiveFinalized.changed || outboxChanged || centerStatusChanged || artifactsChanged
              ? await repository.save(workflowToSave)
              : workflowToSave;
          }
          const run = workflow?.runs.find((item) => item.id === runStreamMatch[1]);
          const events = await readRunEvents(root, requirementId, runStreamMatch[1]);
          for (const event of events.slice(sent)) {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
          }
          sent = events.length;
          const transcript = await readTerminalTranscriptChunk(root, run?.terminalTranscriptPath, transcriptOffset);
          transcriptOffset = transcript.nextOffset;
          if (transcript.event) {
            response.write(`data: ${JSON.stringify(transcript.event)}\n\n`);
          }
          if (run && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'WAITING_FOR_AGENT'].includes(run.status)) {
            if (interval) {
              clearInterval(interval);
            }
            closed = true;
            response.end();
          }
        };
        interval = setInterval(() => {
          push().catch((error) => {
            response.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
          });
        }, 500);
        request.on('close', () => {
          closed = true;
          clearInterval(interval);
        });
        await push();
        return;
      }

      const cancelMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelMatch) {
        const body = await parseBody<{ requirementId: string }>(request);
        const { root, repository } = await resolveWorkflowStore(requestContext);
        const cancelled = await cancelAgentRun(root, body.requirementId, cancelMatch[1]);
        const workflow = await repository.load(body.requirementId);
        if (workflow) {
          const run = workflow.runs.find((item) => item.id === cancelMatch[1]);
          if (run && cancelled) {
            run.status = 'CANCELLED';
            run.finishedAt = new Date().toISOString();
            run.error = '用户取消运行';
            try {
              await finishCenterJobForRun(run, centerRunnerConfig(requestContext));
              if (run.centerJobId && centerRunnerConfig(requestContext)) {
                run.centerSyncedAt = new Date().toISOString();
              }
            } catch {
              // 保留未同步状态，后续需求刷新会继续补偿。
            }
            await repository.save(workflow);
          }
        }
        send(response, 200, { data: { cancelled } });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/artifacts') {
        const filePath = url.searchParams.get('path');
        if (!filePath) {
          send(response, 400, { message: '缺少 path 参数' });
          return;
        }
        send(response, 200, { data: await readArtifact(await resolveArtifactRoot(requestContext, true), filePath) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/artifact-shares') {
        const projectId = url.searchParams.get('projectId') || requestContext.projectId;
        if (!projectId) {
          throw localServiceError('B70003', '缺少项目ID');
        }
        const projectContext = { ...requestContext, projectId: String(projectId) };
        const artifactRoot = await resolveArtifactRoot(projectContext, true);
        const query = url.searchParams.toString();
        const shares = await centerRequest<ArtifactSharePayload[]>(
          projectContext,
          `/api/ai-delivery/artifact-shares${query ? `?${query}` : ''}`
        );
        for (const share of shares) {
          let artifactPath: string;
          try {
            artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
          } catch {
            // 历史异常路径不应阻断其余分享列表和有效位置绑定。
            continue;
          }
          await rememberArtifactShareLocation(workspaceRoot, { ...share, artifactPath }, artifactRoot);
          const token = await findArtifactShareToken(workspaceRoot, { ...share, artifactPath });
          if (token && share.status === 'ENABLED') {
            share.publicPath = `/share/artifacts/${encodeURIComponent(token)}`;
          }
        }
        send(response, 200, { data: shares });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/artifact-shares/public') {
        const body = await parseBody<ArtifactShareCreateInput>(request);
        const projectId = body.projectId || requestContext.projectId;
        const requirementId = String(body.requirementId || '').trim();
        if (!projectId) {
          throw localServiceError('B70003', '缺少项目ID');
        }
        if (!requirementId) {
          throw localServiceError('B70003', '缺少需求号');
        }
        const artifactPath = assertPreviewableArtifactPath(requirementId, String(body.artifactPath || ''));
        const artifactRoot = await resolveArtifactRoot({ ...requestContext, projectId: String(projectId) }, true);
        const resolvedPath = resolveSharePathInWorkspace(artifactRoot, artifactPath);
        const stat = await fs.stat(resolvedPath.absolutePath).catch(() => null);
        if (!stat?.isFile()) {
          throw localServiceError('B70081', '分享产物当前不可读取');
        }
        const share = await centerRequest<ArtifactSharePayload>(requestContext, '/api/ai-delivery/artifact-shares/public', {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            requirementPk: body.requirementPk,
            requirementId,
            artifactPath: resolvedPath.relativePath,
            expireAt: body.expireAt,
            showAnnotations: body.showAnnotations,
            allowDownload: body.allowDownload
          })
        });
        await rememberArtifactShareLocation(
          workspaceRoot,
          {
            id: share.id,
            projectId,
            requirementId,
            artifactPath: resolvedPath.relativePath,
            token: share.token
          },
          artifactRoot
        );
        send(response, 200, {
          data: {
            ...share,
            publicPath: share.token ? `/share/artifacts/${encodeURIComponent(share.token)}` : undefined
          }
        });
        return;
      }

      const regenerateShareMatch = match(pathname, /^\/api\/ai-delivery\/artifact-shares\/([^/]+)\/token\/regenerate$/);
      if (request.method === 'POST' && regenerateShareMatch) {
        const shareId = decodeURIComponent(regenerateShareMatch[1]);
        const share = await centerRequest<ArtifactSharePayload>(
          requestContext,
          `/api/ai-delivery/artifact-shares/${encodeURIComponent(shareId)}/token/regenerate`,
          { method: 'POST', body: JSON.stringify({}) }
        );
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        const projectContext = { ...requestContext, projectId: String(share.projectId) };
        const artifactRoot = await resolveArtifactRoot(projectContext, true);
        await rememberArtifactShareLocation(
          workspaceRoot,
          { ...share, artifactPath, token: share.token },
          artifactRoot
        );
        send(response, 200, {
          data: {
            ...share,
            publicPath: share.token ? `/share/artifacts/${encodeURIComponent(share.token)}` : undefined
          }
        });
        return;
      }

      const publicPreviewMatch = match(pathname, /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/preview$/);
      if (request.method === 'GET' && publicPreviewMatch) {
        const token = decodeURIComponent(publicPreviewMatch[1]);
        const share = await resolvePublicShare(requestContext, token);
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const result = await readArtifact(artifactRoot, artifactPath);
        if (!result.artifact.exists) {
          throw localServiceError('B70081', '分享产物当前不可读取');
        }
        send(response, 200, {
          data: {
            share,
            artifact: result.artifact,
            content: result.content,
            contentType: contentTypeForPath(artifactPath),
            showAnnotations: share.showAnnotations !== false,
            allowDownload: share.allowDownload !== false
          }
        });
        return;
      }

      const publicAnnotationsMatch = match(pathname, /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/tech-design-annotations$/);
      if (request.method === 'GET' && publicAnnotationsMatch) {
        const token = decodeURIComponent(publicAnnotationsMatch[1]);
        const share = await resolvePublicShare(requestContext, token);
        if (share.showAnnotations === false) {
          throw localServiceError('B70082', '公开分享未开启批注展示');
        }
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        if (!artifactPath.match(/^docs\/[^/]+\/technical-design\/design_review\.md$/)) {
          throw localServiceError('B70080', '公开分享产物不是技术方案文档');
        }
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const artifactResult = await readArtifact(artifactRoot, artifactPath);
        if (!artifactResult.artifact.exists) {
          throw localServiceError('B70081', '分享产物当前不可读取');
        }
        const result = await listPublicCenterTechDesignAnnotations(
          requestContext,
          token,
          share.requirementId,
          url.searchParams.get('versionId') || undefined
        );
        send(response, 200, { data: filterTechDesignAnnotationsByContentHash(result, artifactResult.artifact.hash) });
        return;
      }

      if (request.method === 'POST' && publicAnnotationsMatch) {
        if (!requestContext.accessToken && !requestContext.userId) {
          throw localServiceError('B70001', '请先登录后新增批注');
        }
        const token = decodeURIComponent(publicAnnotationsMatch[1]);
        const share = await resolvePublicShare(requestContext, token);
        if (share.showAnnotations === false) {
          throw localServiceError('B70082', '公开分享未开启批注展示');
        }
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        if (!artifactPath.match(/^docs\/[^/]+\/technical-design\/design_review\.md$/)) {
          throw localServiceError('B70080', '公开分享产物不是技术方案文档');
        }
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const input = await parseBody<any>(request);
        const result = await createPublicCenterTechDesignAnnotation(artifactRoot, requestContext, token, { ...share, artifactPath }, input);
        const artifactResult = await readArtifact(artifactRoot, artifactPath);
        send(response, 200, { data: filterTechDesignAnnotationsByContentHash(result, artifactResult.artifact.hash) });
        return;
      }

      const publicAnnotationReplyMatch = match(
        pathname,
        /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/tech-design-annotations\/([^/]+)\/replies$/
      );
      if (request.method === 'POST' && publicAnnotationReplyMatch) {
        if (!requestContext.accessToken && !requestContext.userId) {
          throw localServiceError('B70001', '请先登录后回复批注');
        }
        const token = decodeURIComponent(publicAnnotationReplyMatch[1]);
        const annotationId = decodeURIComponent(publicAnnotationReplyMatch[2]);
        const share = await resolvePublicShare(requestContext, token);
        if (share.showAnnotations === false) {
          throw localServiceError('B70082', '公开分享未开启批注展示');
        }
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        if (!artifactPath.match(/^docs\/[^/]+\/technical-design\/design_review\.md$/)) {
          throw localServiceError('B70080', '公开分享产物不是技术方案文档');
        }
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const artifactResult = await readArtifact(artifactRoot, artifactPath);
        if (!artifactResult.artifact.exists) {
          throw localServiceError('B70081', '分享产物当前不可读取');
        }
        const input = await parseBody<any>(request);
        const result = await createPublicCenterTechDesignAnnotationReply(requestContext, token, share.requirementId, annotationId, input);
        send(response, 200, { data: filterTechDesignAnnotationsByContentHash(result, artifactResult.artifact.hash) });
        return;
      }

      const publicAnnotationReplyDeleteMatch = match(
        pathname,
        /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/tech-design-annotations\/([^/]+)\/replies\/([^/]+)\/delete$/
      );
      if (request.method === 'POST' && publicAnnotationReplyDeleteMatch) {
        if (!requestContext.accessToken && !requestContext.userId) {
          throw localServiceError('B70001', '请先登录后删除回复');
        }
        const token = decodeURIComponent(publicAnnotationReplyDeleteMatch[1]);
        const annotationId = decodeURIComponent(publicAnnotationReplyDeleteMatch[2]);
        const replyId = decodeURIComponent(publicAnnotationReplyDeleteMatch[3]);
        const share = await resolvePublicShare(requestContext, token);
        if (share.showAnnotations === false) {
          throw localServiceError('B70082', '公开分享未开启批注展示');
        }
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        if (!artifactPath.match(/^docs\/[^/]+\/technical-design\/design_review\.md$/)) {
          throw localServiceError('B70080', '公开分享产物不是技术方案文档');
        }
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const artifactResult = await readArtifact(artifactRoot, artifactPath);
        if (!artifactResult.artifact.exists) {
          throw localServiceError('B70081', '分享产物当前不可读取');
        }
        const result = await deletePublicCenterTechDesignAnnotationReply(requestContext, token, share.requirementId, annotationId, replyId);
        send(response, 200, { data: filterTechDesignAnnotationsByContentHash(result, artifactResult.artifact.hash) });
        return;
      }

      const publicAnnotationDeleteMatch = match(
        pathname,
        /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/tech-design-annotations\/([^/]+)\/delete$/
      );
      if (request.method === 'POST' && publicAnnotationDeleteMatch) {
        if (!requestContext.accessToken && !requestContext.userId) {
          throw localServiceError('B70001', '请先登录后删除批注');
        }
        const token = decodeURIComponent(publicAnnotationDeleteMatch[1]);
        const annotationId = decodeURIComponent(publicAnnotationDeleteMatch[2]);
        const share = await resolvePublicShare(requestContext, token);
        if (share.showAnnotations === false) {
          throw localServiceError('B70082', '公开分享未开启批注展示');
        }
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        if (!artifactPath.match(/^docs\/[^/]+\/technical-design\/design_review\.md$/)) {
          throw localServiceError('B70080', '公开分享产物不是技术方案文档');
        }
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const artifactResult = await readArtifact(artifactRoot, artifactPath);
        if (!artifactResult.artifact.exists) {
          throw localServiceError('B70081', '分享产物当前不可读取');
        }
        const result = await deletePublicCenterTechDesignAnnotation(requestContext, token, share.requirementId, annotationId);
        send(response, 200, { data: filterTechDesignAnnotationsByContentHash(result, artifactResult.artifact.hash) });
        return;
      }

      const publicAssetsMatch = match(pathname, /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/assets$/);
      if (request.method === 'GET' && publicAssetsMatch) {
        const token = decodeURIComponent(publicAssetsMatch[1]);
        const assetPath = url.searchParams.get('path');
        if (!assetPath) {
          send(response, 400, { message: '缺少 path 参数' });
          return;
        }
        const share = await resolvePublicShare(requestContext, token);
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const normalizedAssetPath = resolvePublicAssetPath(share.requirementId, artifactPath, assetPath);
        const resolvedPath = resolveSharePathInWorkspace(artifactRoot, normalizedAssetPath);
        const fileBuffer = await fs.readFile(resolvedPath.absolutePath);
        response.writeHead(200, {
          'Content-Type': contentTypeForPath(normalizedAssetPath),
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        });
        response.end(fileBuffer);
        return;
      }

      const publicViewMatch = match(pathname, /^\/api\/ai-delivery\/public-artifact-shares\/([^/]+)\/view\/(.+)$/);
      if (request.method === 'GET' && publicViewMatch) {
        const token = decodeURIComponent(publicViewMatch[1]);
        const requestedPath = decodeArtifactViewPath(publicViewMatch[2]);
        const share = await resolvePublicShare(requestContext, token);
        const artifactPath = assertPreviewableArtifactPath(share.requirementId, share.artifactPath);
        const artifactRoot = await resolvePublicArtifactRoot(requestContext, { ...share, artifactPath });
        const normalizedPath = resolvePublicHtmlViewPath(share.requirementId, artifactPath, requestedPath);
        const resolvedPath = resolveSharePathInWorkspace(artifactRoot, normalizedPath);
        const fileBuffer = await fs.readFile(resolvedPath.absolutePath);
        response.writeHead(200, {
          'Content-Type': contentTypeForPath(normalizedPath),
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        });
        response.end(fileBuffer);
        return;
      }

      // 读取图片等二进制文件
      const artifactViewMatch = match(pathname, /^\/api\/artifacts\/view\/context\/([^/]+)\/(.+)$/);
      if (request.method === 'GET' && artifactViewMatch) {
        const viewContext = decodeArtifactViewContext(artifactViewMatch[1]);
        const filePath = decodeArtifactViewPath(artifactViewMatch[2]);
        try {
          const artifactRoot = await resolveArtifactRoot({ ...requestContext, ...viewContext }, true);
          const absolutePath = resolveSharePathInWorkspace(artifactRoot, filePath).absolutePath;
          const fileBuffer = await fs.readFile(absolutePath);
          response.writeHead(200, {
            'Content-Type': contentTypeForPath(filePath),
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(fileBuffer);
        } catch (error: any) {
          const denied = error.code === 'B70065' || error.code === 'B70080' || String(error.message || '').includes('路径不在工作区内');
          response.writeHead(denied ? 403 : 404, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: error.code === 'ENOENT' ? '文件不存在' : error.message }));
        }
        return;
      }

      if (request.method === 'GET' && pathname === '/api/artifacts/read') {
        const filePath = url.searchParams.get('path');
        if (!filePath) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: '缺少 path 参数' }));
          return;
        }
        try {
          const artifactRoot = await resolveArtifactRoot(requestContext, true);
          const absolutePath = resolveSharePathInWorkspace(artifactRoot, filePath).absolutePath;
          const fileBuffer = await fs.readFile(absolutePath);
          response.writeHead(200, {
            'Content-Type': contentTypeForPath(filePath),
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(fileBuffer);
        } catch (error: any) {
          const denied = error.code === 'B70065' || error.code === 'B70080' || String(error.message || '').includes('路径不在工作区内');
          response.writeHead(denied ? 403 : 404, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: error.code === 'ENOENT' ? '文件不存在' : error.message }));
        }
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/artifacts') {
        const body = await parseBody<{ path: string; content: string; expectedHash?: string }>(request);
        const requirementId = requirementIdFromArtifactPath(body.path);
        let workflowForPath: RequirementWorkflow | undefined;
        if (requirementId) {
          workflowForPath = (await loadMergedWorkflow(requestContext, requirementId, true)).workflow || undefined;
          if (workflowForPath) {
            await assertWritableWorkflow(requestContext, workflowForPath);
          }
        }
        const result = await saveArtifact(await resolveArtifactRoot(requestContext, true), body.path, body.content, body.expectedHash);
        if (workflowForPath) {
          await reportRequirementWorkspaceState(requestContext, workflowForPath).catch(() => undefined);
        }
        send(response, 200, { data: result });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/reviews') {
        const input = await parseBody<ReviewInput>(request);
        const { root, repository } = await resolveWorkflowStore(requestContext, true);
        const lock = new WorkflowLock(root, input.requirementId);
        await lock.acquire();
        try {
          let workflow = (await loadMergedWorkflow(requestContext, input.requirementId, true)).workflow;
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          await assertWritableWorkflow(requestContext, workflow);
          if (input.stage === 'RETROSPECTIVE') {
            const retrospective = await getRetrospectiveSummary(root, workflow, requestContext.projectId ? String(requestContext.projectId) : undefined);
            workflow = {
              ...workflow,
              retrospective: {
                ...(workflow.retrospective || {}),
                summaryPath: retrospective.summaryPath,
                evidencePath: retrospective.evidencePath,
                candidateCount: retrospective.candidateCount,
                pendingCandidateCount: retrospective.pendingCandidateCount,
                recallFeedbackCount: retrospective.recallFeedbackCount,
                unresolvedRiskCount: retrospective.unresolvedRiskCount
              }
            };
          }
          if (input.stage === 'IMPLEMENTATION' && input.implementationStep === 'CHANGE_INSPECTION' && input.decision === 'APPROVED') {
            const projectPaths = workflow.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
            const aiCommits = await assertProjectsCleanAndPushed(root, workflow.projects || [], workflow.branchName, projectPaths);
            workflow = {
              ...workflow,
              aiCodeCompleteness: mergeAiCommitCaptures(workflow, aiCommits)
            };
          }
          workflow = await applyReview(root, workflow, input);
          if (input.stage === 'CODE_REVIEW') {
            workflow.issues = await refreshCodeReviewIssues(root, workflow);
          }
          workflow = await repository.save(workflow);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      send(response, 404, { message: '接口不存在' });
    } catch (error: any) {
      const status = statusForError(error);
      send(response, status, {
        message: error.message || '服务异常',
        code: error.code,
        data: error.data ?? (error.currentHash ? { currentHash: error.currentHash } : undefined)
      });
    }
  };
}
