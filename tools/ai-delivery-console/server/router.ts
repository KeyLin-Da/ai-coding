import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import type { ActionInput, GitStageUntrackedInput, PrdSourceFile, RequirementInput, RequirementWorkflow, ReviewInput, RunRecord, TechDesignSourceFile, WorkflowStatus } from '../shared/workflow';
import { ensureImplementationSteps, isImplementationStep, stageForAction } from '../shared/workflow';
import { normalizePrdClarification, WorkflowRepository } from './services/workflow-repository';
import { scanRequirementArtifacts } from './services/workspace-scanner';
import { WorkflowLock } from './services/workflow-lock';
import { assertPrdClarificationReady, buildActionCommand, executeAction, validateActionInput } from './services/action-adapters';
import { appendStageCommandLog, readRunEvents, readRunEventsWithTranscript, readTerminalTranscriptChunk, readTerminalTranscriptSize } from './services/run-log';
import { readArtifact, saveArtifact } from './services/markdown-service';
import { applyReview, refreshCodeReviewIssues, returnToImplementation } from './services/review-service';
import { cancelAgentRun, listAgentProviders, refreshTerminalRunStatuses } from './services/agent-providers';
import { normalizeOpenSpecChangeName, readOpenSpecSummary, updateOpenSpecTaskStatus } from './services/openspec-summary';
import { readGitChanges, stageUntrackedFiles } from './services/git-changes';
import { buildArtifactGitSyncPlan, confirmArtifactGitSync, type ArtifactGitSyncConfirmInput, type ArtifactGitSyncPlanInput } from './services/artifact-git-sync';
import { centerPublicRequest, centerRequest } from './services/center-client';
import { readProjectHistory, listProjectsFromConfiguredPaths } from './services/project-history';
import { assertProjectPathsConfigured, loadPrivateProjectSettings, loadSettings, saveSettings, validateSettings } from './services/project-settings';
import { parseLocalRequestContext, type LocalRequestContext } from './services/local-request-context';
import { localServiceError } from './services/local-errors';
import { generateLocalGitCredential, regenerateLocalGitCredential, type LocalGitCredentialGenerateInput } from './services/local-git-credentials';
import { cloneProjectRepository, commitAndPushProjectRepository, inspectProjectRepository, readProjectRepositoryStatus, resolveProjectRepoPath, syncProjectRepository } from './services/project-repository';
import { bootstrapProjectArtifactWorkspace } from './services/skill-sync';
import { deleteTechDesignQuestionRecord, type DeleteTechDesignQuestionInput } from './services/tech-design-questions';
import {
  createTechDesignAnnotation,
  consumeTechDesignAnnotations,
  deleteTechDesignAnnotation,
  listTechDesignAnnotations,
  rebuildTechDesignAnnotationSummary,
  updateTechDesignAnnotationStatus
} from './services/tech-design-annotations';
import {
  centerTechDesignAnnotationsEnabled,
  consumeCenterTechDesignAnnotationsAndSnapshot,
  createCenterTechDesignAnnotation,
  deleteCenterTechDesignAnnotation,
  listCenterTechDesignAnnotations,
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
import { listCenterRequirementWorkflows, loadCachedCenterRequirementWorkflow, loadCenterRequirementWorkflow, mergeRequirementWorkflow } from './services/requirement-workflow-view';
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
import {
  assertPreviewableArtifactPath,
  contentTypeForPath,
  resolvePublicAssetPath,
  resolveSharePathInWorkspace
} from './services/artifact-share-paths';
import { findArtifactShareRoot, findArtifactShareToken, rememberArtifactShareLocation } from './services/artifact-share-locations';

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
}

async function parseBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
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

export async function consumeTechDesignInputsAfterRun(
  root: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  context?: LocalRequestContext
): Promise<RequirementWorkflow> {
  if (run.actionType !== 'DESIGN_GENERATE' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return workflow;
  }
  const params = run.params || {};
  const consumedQuestionPaths = pendingTechDesignQuestionPaths(workflow, params);
  const consumedSourceFilePaths = (workflow.techDesignSourceFiles || []).map((file) => file.path).filter(Boolean);
  const clarification = typeof params.clarification === 'string' ? params.clarification : workflow.techDesignClarification || '';
  const ledger = await consumeTechDesignInputLedger(root, workflow.requirementId, {
    questionPaths: consumedQuestionPaths,
    sourceFilePaths: consumedSourceFilePaths,
    clarification,
    runId: run.id
  });
  if (context && centerTechDesignAnnotationsEnabled(context, workflow)) {
    await consumeCenterTechDesignAnnotationsAndSnapshot(root, context, workflow, run.id);
  } else {
    await consumeTechDesignAnnotations(root, workflow.requirementId, run.id);
  }
  const ledgerQuestionPaths = consumedQuestionPathsFromLedger(ledger);
  return {
    ...workflow,
    techDesignClarification: '',
    techDesignSourceFiles: [],
    techDesignConsumedQuestionPaths: [...new Set([...(workflow.techDesignConsumedQuestionPaths || []), ...ledgerQuestionPaths])]
  };
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

function applyImplementationRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (!isImplementationStep(run.implementationStep)) {
    return workflow;
  }
  const implementationSteps = ensureImplementationSteps(workflow.implementationSteps);
  implementationSteps[run.implementationStep] = {
    ...implementationSteps[run.implementationStep],
    status: implementationStatusForRun(run),
    runId: run.id
  };
  return {
    ...workflow,
    implementationSteps,
    stages: {
      ...workflow.stages,
      IMPLEMENTATION: {
        ...workflow.stages.IMPLEMENTATION,
        status: workflow.stages.IMPLEMENTATION.status === 'APPROVED' ? 'APPROVED' : 'IN_PROGRESS',
        runId: run.id
      }
    }
  };
}

export function applyPrdClarificationRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (run.actionType !== 'PRD_CLARIFY' || !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return workflow;
  }
  const artifactPath =
    workflow.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path ||
    workflow.stages.PRD.artifactPath ||
    `docs/${workflow.requirementId}/prd/analysis.md`;
  return {
    ...workflow,
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
  const forbiddenCodes = new Set(['B70002', 'B70046', 'B70063', 'B70080']);
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
  if (conflictCodes.has(code || '')) {
    return 409;
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
            const refreshed = await refreshTerminalRunStatuses(root, merged);
            return saveWithArtifacts(root, repository, refreshed.workflow);
          }));
        } catch {
          workflows = await Promise.all((await repository.list()).map((workflow) => mergeTechDesignInputLedgerIntoWorkflow(root, workflow)));
        }
        send(response, 200, { data: workflows });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/requirements') {
        const input = await parseBody<RequirementInput>(request);
        const projectPaths = input.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
        const { root, repository } = await resolveWorkflowStore(requestContext);
        let workflow = await repository.upsert(input, projectPaths);
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
        const refreshed = await refreshTerminalRunStatuses(store.root, workflow);
        workflow = refreshed.workflow;
        if (refreshed.changed) {
          workflow = await store.repository.save(workflow);
        }
        send(response, 200, { data: workflow });
        scheduleArtifactIndexRefresh(store.root, store.repository, workflow);
        scheduleRequirementWorkspaceStateReport(requestContext, workflow);
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
          await assertWritableWorkflow(requestContext, workflow);
          const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
          const changeName = normalizeOpenSpecChangeName(input.changeName || fallbackChangeName, fallbackChangeName);
          const summary = await updateOpenSpecTaskStatus(root, changeName, fallbackChangeName, Number(input.line), Boolean(input.completed), input.raw);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
          send(response, 200, { data: summary });
        } finally {
          await lock.release();
        }
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
          await assertWritableWorkflow(requestContext, workflow);
          const nextWorkflow = await deleteTechDesignQuestionRecord(root, workflow, input);
          workflow = await saveWithArtifacts(root, repository, nextWorkflow);
          await reportRequirementWorkspaceState(requestContext, workflow).catch(() => undefined);
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
              prdClarification: normalizePrdClarification(typeof params.description === 'string' ? params.description : workflow.prdClarification)
            };
          }
          if (action.actionType === 'PRD_CLARIFY') {
            await assertPrdClarificationReady(root, workflow, action);
            const params = action.params || {};
            workflow = {
              ...workflow,
              prdClarification: normalizePrdClarification(typeof params.description === 'string' ? params.description : '')
            };
          }
          if (action.actionType === 'DESIGN_GENERATE') {
            const params = action.params || {};
            const documentPath = designDocumentPath(workflow, params);
            await createTechDesignDraftSnapshot(root, workflow.requirementId).catch(() => undefined);
            const preparedAnnotations = await prepareCenterTechDesignAnnotationInput(root, requestContext, workflow);
            if (preparedAnnotations?.sourceFilePath) {
              const sourceFiles = Array.isArray(params.sourceFiles)
                ? params.sourceFiles.map((item) => String(item).trim()).filter(Boolean)
                : [];
              effectiveAction = {
                ...action,
                params: {
                  ...params,
                  sourceFiles: [...sourceFiles, preparedAnnotations.sourceFilePath]
                }
              };
            }
            workflow = {
              ...workflow,
              techDesignDocument: documentPath,
              techDesignClarification: typeof params.clarification === 'string' ? params.clarification : workflow.techDesignClarification
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
          const projectPaths = workflow.projects?.length ? await loadCurrentProjectPaths(requestContext, true) : [];
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
            await repository.save(latest);
          }, { projectPaths });
          
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
          workflow = await consumeTechDesignInputsAfterRun(root, workflow, run, requestContext);
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
          if (['PRD_ANALYZE', 'PRD_CLARIFY', 'DESIGN_GENERATE', 'DESIGN_QUESTION', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_ARCHIVE'].includes(effectiveAction.actionType)) {
            workflow.artifacts = await scanRequirementArtifacts(
              root,
              workflow.requirementId,
              workflow.branchName,
              workflow.stages.IMPLEMENTATION.changeName,
              workflow.requirementType
            );
          }
          workflow = applyPrdClarificationRun(workflow, run);
          if (effectiveAction.actionType === 'RETURN_TO_IMPLEMENTATION') {
            const issues = await refreshCodeReviewIssues(root, workflow);
            workflow = returnToImplementation(workflow, issues);
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
        send(response, 200, { data: { commandText: buildActionCommand(workflow, action) } });
        return;
      }

      const runMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/events$/);
      if (request.method === 'GET' && runMatch) {
        const requirementId = url.searchParams.get('requirementId') || '';
        const { root, workflow } = await loadMergedWorkflow(requestContext, requirementId);
        const run = workflow?.runs.find((item) => item.id === runMatch[1]);
        send(response, 200, { data: await readRunEventsWithTranscript(root, requirementId, runMatch[1], run?.terminalTranscriptPath) });
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
            const refreshed = await refreshTerminalRunStatuses(root, workflow);
            workflow = refreshed.changed ? await repository.save(refreshed.workflow) : refreshed.workflow;
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

      // 读取图片等二进制文件
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
