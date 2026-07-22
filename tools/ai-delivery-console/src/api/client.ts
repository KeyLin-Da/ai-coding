import type {
  ActionInput,
  AiCodeCompletenessInput,
  AiCodeCompletenessResult,
  AiCodeCompletenessState,
  AgentProvider,
  ArtifactRef,
  GitChangeSummary,
  GitDiffPreview,
  GitFilePreview,
  GitStageUntrackedInput,
  OpenSpecVisualContextCandidate,
  OpenSpecSummary,
  RequirementTokenUsageSummary,
  RequirementTokenUsagePage,
  RequirementInput,
  RequirementWorkflow,
  ReviewInput,
  RunEvent,
  RunRecord,
  RunTokenUsageDetail,
  RunTokenUsageRun,
  SupplementInputsUpdate,
  TechDesignAnnotationCreateInput,
  TechDesignAnnotationDeleteInput,
  TechDesignAnnotationList,
  TechDesignAnnotationReplyCreateInput,
  TechDesignAnnotationStatusInput,
  TokenUsageSummary,
  TechDesignVersion,
  TechDesignVersionContent,
  TechDesignVersionDiff,
  TechDesignVersionDiffInput,
  WorkflowProject
} from '@shared/workflow';
import { createEmptyStages, emptyRequirementTokenUsage, emptyRunTokenUsage, emptyTokenUsageSummary } from '@shared/workflow';
import type {
  MemoryCandidate,
  MemoryCandidateConfirmInput,
  MemoryCandidateFilter,
  MemoryCandidateUpdateInput,
  MemoryCard,
  MemoryCardCreateInput,
  MemoryCardFilter,
  MemoryCardRevision,
  MemoryCardUpdateInput,
  MemoryPage,
  MemoryRecallConfirmInput,
  MemoryRecallFilter,
  MemoryRecallPreviewResult,
  MemoryRecallRecord,
  MemorySearchConfig,
  RetrospectiveSummary
} from '@shared/memory';
import { apiRuntimeHeaders, getApiRuntimeConfig, resolveApiUrl, resolveRunnerApiUrl } from './runtime';
import { loadWorkflowItemCache, loadWorkflowListCache, normalizeWorkflowCacheItem, saveWorkflowCache, saveWorkflowItemCache } from '@/services/workflow-cache';

export interface DeleteTechDesignQuestionInput {
  id?: string;
  recordId?: string;
  runId?: string;
  sourcePath?: string;
  question?: string;
}

interface ApiResult<T> {
  data: T;
  message?: string;
  success?: boolean;
  code?: string;
}

interface CenterWorkflowStageVO {
  id: number;
  stage: RequirementWorkflow['currentStage'];
  status: RequirementWorkflow['status'];
  artifactId?: number;
  approvedAt?: string;
  rejectedAt?: string;
  comment?: string;
  version?: number;
}

interface CenterRequirementVO {
  id: number;
  projectId: number;
  requirementId: string;
  title: string;
  requirementType?: RequirementWorkflow['requirementType'];
  branchName?: string;
  status: RequirementWorkflow['status'];
  currentStage: RequirementWorkflow['currentStage'];
  version?: number;
  stages?: CenterWorkflowStageVO[];
  projectNames?: string[];
}

interface CenterRunEventVO {
  id?: number;
  runId: number;
  seq: number;
  level: RunEvent['level'];
  type?: string;
  message: string;
  payloadJson?: string;
  createdAt?: string;
}

export interface CenterWsTicketVO {
  ticket: string;
  wsUrl: string;
  expireAt: string;
}

export interface UserProfileVO {
  id: number;
  account: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
}

export interface AuthSessionVO {
  token: string;
  expireAt: string;
  user: UserProfileVO;
}

export interface DeliveryProjectVO {
  id: number;
  name: string;
  code: string;
  status: string;
  role: string;
  selected?: boolean;
  repository?: ProjectRepositoryVO;
}

export interface ProjectRepositoryVO {
  id: number;
  projectId: number;
  provider: string;
  repoUrl: string;
  defaultBranch: string;
  repoCode: string;
  status: string;
}

export interface ProjectCreateInput {
  name: string;
  repository: {
    provider: string;
    repoUrl: string;
    defaultBranch?: string;
  };
}

export interface WorkspaceMappingVO {
  id: number;
  projectId: number;
  clientSessionId?: number;
  localPath: string;
  displayName?: string;
  isDefault?: boolean;
  status: string;
}

export interface DeliveryWorkspaceVO {
  id: number;
  projectId: number;
  clientSessionId?: number;
  localPath: string;
  status: string;
}

export interface GitCredentialVO {
  id: number;
  platform: string;
  fingerprint: string;
  publicKey: string;
  status: string;
  generatedAt?: string;
  revokedAt?: string;
}

export type ProjectRepoSyncStatus = 'NOT_CLONED' | 'READY' | 'BEHIND_REMOTE' | 'DIRTY' | 'CONFLICTING' | 'PUSHING' | 'PUSHED' | 'FAILED';

export interface ProjectRepoStateVO {
  id?: number;
  projectId: number;
  clientSessionId: number;
  localRepoPath: string;
  currentBranch?: string;
  headCommit?: string;
  remoteCommit?: string;
  syncStatus: ProjectRepoSyncStatus;
  lastCheckedAt?: string;
}

export interface ProjectArtifactBootstrapResultVO {
  openSpecInitialized: boolean;
  agentDirsInitialized: string[];
  codingSkills: {
    synced: number;
    targetDirs: string[];
  };
}

export interface ProjectSkillUpdateResultVO {
  bootstrap: ProjectArtifactBootstrapResultVO;
  state: ProjectRepoStateVO;
}

export interface RequirementWorkspaceStateVO {
  id?: number;
  projectId: number;
  requirementPk: string | number;
  userId: string | number;
  userDisplayName?: string;
  clientSessionId: string | number;
  status: 'CLEAN' | 'EDITING' | 'DIRTY' | 'SYNCING' | 'EXPIRED';
  dirtyFileCount: number;
  dirtyPathsSample: string[];
  headCommit?: string;
  remoteCommit?: string;
  firstDirtyAt?: string;
  lastReportedAt?: string;
  expireAt?: string;
}

export interface ArtifactGitSyncPlanFile {
  path: string;
  status: string;
  selected: boolean;
  contentSha256?: string;
}

export interface ArtifactGitSyncPlan {
  requirementId: string;
  stage: RequirementWorkflow['currentStage'];
  syncType: 'REVIEW_APPROVAL' | 'PUBLIC_SYNC' | 'SKILL_SYNC' | 'BOOTSTRAP';
  blocked: boolean;
  blockers: string[];
  repoPath: string;
  headCommit?: string;
  remoteCommit?: string;
  files: ArtifactGitSyncPlanFile[];
  diff: string;
}

export interface ArtifactGitSyncConfirmInput {
  stage: RequirementWorkflow['currentStage'];
  syncType?: 'REVIEW_APPROVAL' | 'PUBLIC_SYNC' | 'SKILL_SYNC' | 'BOOTSTRAP';
  files: string[];
  message?: string;
  requirementPk?: string | number;
  review?: {
    decision: ReviewInput['decision'];
    comment?: string;
    implementationStep?: ReviewInput['implementationStep'];
  };
}

export interface ArtifactGitSyncConfirmResult {
  commitSha?: string;
  pushed: boolean;
  centerResult: unknown;
}

export interface CenterReviewVO {
  id: number;
  requirementPk: number;
  stage: ReviewInput['stage'];
  implementationStep?: ReviewInput['implementationStep'];
  decision: ReviewInput['decision'];
  comment?: string;
  actorId?: number;
  artifactVersionId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type ReviewSubmissionInput = ReviewInput & {
  requirementPk?: string | number;
};

export interface ArtifactShareCreateInput {
  projectId: string | number;
  requirementPk?: string | number;
  requirementId: string;
  artifactPath: string;
  expireAt?: string;
  showAnnotations?: boolean;
  allowDownload?: boolean;
}

export interface ArtifactShareVO {
  id: number;
  projectId: number;
  requirementPk?: number;
  requirementId: string;
  artifactPath: string;
  visibility?: string;
  status: string;
  expireAt?: string;
  showAnnotations?: boolean;
  allowDownload?: boolean;
  accessCount?: number;
  lastAccessAt?: string;
  createdBy?: number;
  revokedAt?: string;
  createdAt?: string;
  token?: string;
  publicPath?: string;
  realtimeChannel?: string;
}

export interface PublicArtifactPreviewPayload {
  share: ArtifactShareVO;
  artifact: ArtifactRef;
  content: string;
  contentType?: string;
  showAnnotations?: boolean;
  allowDownload?: boolean;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(resolveApiUrl(url), {
    ...options,
    headers: isFormData
      ? {
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        }
      : {
          'Content-Type': 'application/json',
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        }
  });
  const body = (await response.json()) as ApiResult<T>;
  if (!response.ok || body.success === false) {
    const error = new Error(body.message || '请求失败') as Error & { code?: string; data?: unknown };
    error.code = body.code;
    error.data = body.data;
    throw error;
  }
  return body.data;
}

async function runnerRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(resolveRunnerApiUrl(url), {
    ...options,
    headers: isFormData
      ? {
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        }
      : {
          'Content-Type': 'application/json',
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        }
  });
  const body = (await response.json()) as ApiResult<T>;
  if (!response.ok || body.success === false) {
    const error = new Error(body.message || '请求失败') as Error & { code?: string; data?: unknown };
    error.code = body.code;
    error.data = body.data;
    throw error;
  }
  return body.data;
}

function requireRemoteProjectId(): string {
  const projectId = getApiRuntimeConfig().projectId;
  if (!projectId) {
    throw new Error('缺少中心服务 projectId');
  }
  if (!/^\d+$/.test(projectId)) {
    throw new Error('中心服务 projectId 必须是数字');
  }
  return projectId;
}

function queryString(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.set(key, String(value));
    }
  }
  const value = params.toString();
  return value ? `?${value}` : '';
}

function centerRequirementToWorkflow(item: CenterRequirementVO): RequirementWorkflow {
  const stages = createEmptyStages(item.requirementType || 'REQUIREMENT');
  for (const stage of item.stages || []) {
    if (stage.stage && stage.stage !== 'DONE' && stages[stage.stage]) {
      stages[stage.stage] = {
        stage: stage.stage,
        status: stage.status,
        artifactPath: stage.artifactId ? String(stage.artifactId) : undefined,
        approvedAt: stage.approvedAt,
        rejectedAt: stage.rejectedAt,
        comment: stage.comment
      };
    }
  }
  return normalizeRequirementWorkflow({
    id: item.id,
    requirementId: item.requirementId,
    title: item.title,
    requirementType: item.requirementType || 'REQUIREMENT',
    branchName: item.branchName,
    projects: (item.projectNames || []).map((name) => ({ name, path: name })),
    sources: [],
    currentStage: item.currentStage,
    status: item.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages,
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  });
}

function normalizeRequirementWorkflow(workflow: RequirementWorkflow): RequirementWorkflow {
  return normalizeWorkflowCacheItem(workflow);
}

function normalizeRequirementWorkflows(workflows: RequirementWorkflow[]): RequirementWorkflow[] {
  return workflows.map(normalizeRequirementWorkflow);
}

function centerRunEventToRunEvent(item: CenterRunEventVO): RunEvent {
  const normalizedType = String(item.type || 'INFO').toUpperCase();
  const typeMap: Record<string, RunEvent['type']> = {
    START: 'START',
    STDOUT: 'STDOUT',
    STDERR: 'STDERR',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    ARTIFACT: 'ARTIFACT',
    EXIT: 'EXIT',
    CANCELLED: 'CANCELLED'
  };
  return {
    time: item.createdAt || new Date().toISOString(),
    type: typeMap[normalizedType] || 'INFO',
    level: item.level,
    message: item.message,
    text: item.message,
    data: parseJson(item.payloadJson)
  };
}

export function isCenterRunId(runId: string | number): boolean {
  return /^\d+$/.test(String(runId).trim());
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeTokenUsageSummary(summary?: Partial<TokenUsageSummary>, runId?: string | number): TokenUsageSummary {
  return {
    runId: summary?.runId ?? runId,
    totalTokens: numberOrZero(summary?.totalTokens),
    inputTokens: numberOrZero(summary?.inputTokens),
    cachedInputTokens: numberOrZero(summary?.cachedInputTokens),
    outputTokens: numberOrZero(summary?.outputTokens),
    reasoningOutputTokens: numberOrZero(summary?.reasoningOutputTokens),
    runCount: numberOrZero(summary?.runCount),
    detailCount: numberOrZero(summary?.detailCount),
    latestOccurredAt: summary?.latestOccurredAt
  };
}

function normalizeRunTokenUsage(runId: string | number, value?: Partial<RunTokenUsageRun>): RunTokenUsageRun {
  const details = (value?.details || []).map((detail) => normalizeRunTokenUsageDetail(runId, detail));
  return {
    runId: value?.runId ?? runId,
    summary: normalizeTokenUsageSummary(value?.summary, value?.runId ?? runId),
    details
  };
}

function normalizeRunTokenUsageDetail(runId: string | number, detail: Partial<RunTokenUsageDetail>): RunTokenUsageDetail {
  return {
    runId: detail.runId ?? runId,
    id: detail.id,
    requirementPk: detail.requirementPk,
    jobId: detail.jobId,
    clientSessionId: detail.clientSessionId,
    agentId: detail.agentId,
    stage: detail.stage,
    implementationStep: detail.implementationStep,
    model: detail.model,
    sourceEventType: detail.sourceEventType || 'turn.completed',
    usageFingerprint: detail.usageFingerprint,
    inputTokens: numberOrZero(detail.inputTokens),
    cachedInputTokens: numberOrZero(detail.cachedInputTokens),
    outputTokens: numberOrZero(detail.outputTokens),
    reasoningOutputTokens: numberOrZero(detail.reasoningOutputTokens),
    totalTokens: numberOrZero(detail.totalTokens),
    rawUsageJson: detail.rawUsageJson,
    occurredAt: detail.occurredAt,
    createdAt: detail.createdAt
  };
}

function normalizeRequirementTokenUsage(requirementPk: string | number, value?: Partial<RequirementTokenUsageSummary>): RequirementTokenUsageSummary {
  return {
    requirementPk: value?.requirementPk ?? requirementPk,
    summary: normalizeTokenUsageSummary(value?.summary),
    latestRunSummary: normalizeTokenUsageSummary(value?.latestRunSummary),
    stageSummaries: (value?.stageSummaries || []).map((bucket) => ({
      bucketType: bucket.bucketType || 'stage',
      bucketKey: bucket.bucketKey || 'UNKNOWN',
      summary: normalizeTokenUsageSummary(bucket.summary)
    })),
    agentSummaries: (value?.agentSummaries || []).map((bucket) => ({
      bucketType: bucket.bucketType || 'agent',
      bucketKey: bucket.bucketKey || 'UNKNOWN',
      summary: normalizeTokenUsageSummary(bucket.summary)
    }))
  };
}

function normalizeRequirementTokenUsagePage(
  requirementPk: string | number,
  page: number,
  pageSize: number,
  value?: Partial<RequirementTokenUsagePage>
): RequirementTokenUsagePage {
  return {
    requirementPk: value?.requirementPk ?? requirementPk,
    page: numberOrZero(value?.page) || page,
    pageSize: numberOrZero(value?.pageSize) || pageSize,
    total: numberOrZero(value?.total),
    items: (value?.items || []).map((detail) => normalizeRunTokenUsageDetail(detail.runId || '', detail))
  };
}

function runEventsToTokenUsage(runId: string | number, events: RunEvent[]): RunTokenUsageRun {
  const details: RunTokenUsageDetail[] = events.flatMap((event, index) => {
    const data = event.data as
      | {
          kind?: string;
          sourceEventType?: string;
          model?: string;
          usageFingerprint?: string;
          usage?: Partial<TokenUsageSummary>;
        }
      | undefined;
    if (data?.kind !== 'TOKEN_USAGE' || !data.usage) {
      return [];
    }
    const inputTokens = numberOrZero(data.usage.inputTokens);
    const outputTokens = numberOrZero(data.usage.outputTokens);
    return [
      {
        id: `${runId}:${index}`,
        runId,
        agentId: event.agentId,
        model: data.model,
        sourceEventType: data.sourceEventType || 'turn.completed',
        usageFingerprint: data.usageFingerprint,
        inputTokens,
        cachedInputTokens: numberOrZero(data.usage.cachedInputTokens),
        outputTokens,
        reasoningOutputTokens: numberOrZero(data.usage.reasoningOutputTokens),
        totalTokens: numberOrZero(data.usage.totalTokens) || inputTokens + outputTokens,
        rawUsageJson: event.text,
        occurredAt: event.time,
        createdAt: event.time
      }
    ];
  });
  return {
    runId,
    summary: summarizeTokenUsageDetails(details, runId),
    details
  };
}

function summarizeTokenUsageDetails(details: RunTokenUsageDetail[], runId?: string | number): TokenUsageSummary {
  const summary = emptyTokenUsageSummary(runId);
  const runIds = new Set<string>();
  for (const detail of details) {
    summary.totalTokens += detail.totalTokens;
    summary.inputTokens += detail.inputTokens;
    summary.cachedInputTokens += detail.cachedInputTokens;
    summary.outputTokens += detail.outputTokens;
    summary.reasoningOutputTokens += detail.reasoningOutputTokens;
    summary.detailCount += 1;
    runIds.add(String(detail.runId));
    if (!summary.latestOccurredAt || (detail.occurredAt && detail.occurredAt > summary.latestOccurredAt)) {
      summary.latestOccurredAt = detail.occurredAt;
      summary.runId = detail.runId;
    }
  }
  summary.runCount = runIds.size;
  return summary;
}

function parseJson(value?: string): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export interface ClientSessionVO {
  id: number;
  userId: number;
  osType: string;
  capabilities: string;
  status: string;
  lastHeartbeatAt: string;
}

export const apiClient = {
  register(input: { account: string; displayName: string }) {
    return request<AuthSessionVO>('/api/ai-delivery/auth/register', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  login(input: { account: string }) {
    return request<AuthSessionVO>('/api/ai-delivery/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getCurrentUser() {
    return request<UserProfileVO>('/api/ai-delivery/auth/me');
  },
  updateProfile(input: { displayName: string; avatarUrl?: string }) {
    return request<UserProfileVO>('/api/ai-delivery/auth/profile', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  logout() {
    return request<void>('/api/ai-delivery/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  listMyProjects() {
    return request<DeliveryProjectVO[]>('/api/ai-delivery/projects/my');
  },
  createProject(input: ProjectCreateInput) {
    return request<DeliveryProjectVO>('/api/ai-delivery/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  joinProject(input: { code: string }) {
    return request<DeliveryProjectVO>('/api/ai-delivery/projects/join', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  selectProject(projectId: string | number) {
    return request<DeliveryProjectVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/select`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  bootstrapProjectRepository(projectId: string | number, repository: ProjectCreateInput['repository']) {
    return request<DeliveryProjectVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository/bootstrap`, {
      method: 'POST',
      body: JSON.stringify(repository)
    });
  },
  listWorkspaceMappings(projectId: string | number) {
    return request<WorkspaceMappingVO[]>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/workspace-mappings`);
  },
  saveWorkspaceMapping(projectId: string | number, input: { localPath: string; displayName?: string; isDefault?: boolean; clientSessionId?: number }) {
    return request<WorkspaceMappingVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/workspace-mappings`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  disableWorkspaceMapping(projectId: string | number, mappingId: string | number) {
    return request<WorkspaceMappingVO>(
      `/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/workspace-mappings/${encodeURIComponent(String(mappingId))}/disable`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  },
  getDeliveryWorkspace(projectId: string | number = getApiRuntimeConfig().projectId) {
    if (!projectId) {
      throw new Error('缺少项目ID');
    }
    return request<DeliveryWorkspaceVO | undefined>(
      `/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/delivery-workspace`
    );
  },
  saveDeliveryWorkspace(projectId: string | number, localPath: string) {
    if (!projectId) {
      throw new Error('缺少项目ID');
    }
    return request<DeliveryWorkspaceVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/delivery-workspace`, {
      method: 'POST',
      body: JSON.stringify({
        localPath
      })
    });
  },
  listGitCredentials() {
    return request<GitCredentialVO[]>('/api/ai-delivery/users/me/git-credentials');
  },
  generateLocalGitCredential(input: { platform?: string; comment?: string } = {}) {
    return runnerRequest<GitCredentialVO>('/api/ai-delivery/git-credentials/generate-local', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  regenerateLocalGitCredential(credentialId: string | number, input: { platform?: string; comment?: string } = {}) {
    return runnerRequest<GitCredentialVO>(`/api/ai-delivery/git-credentials/${encodeURIComponent(String(credentialId))}/regenerate-local`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  cloneProjectRepository(projectId: string | number) {
    return runnerRequest<ProjectRepoStateVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository/clone`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  getProjectRepositoryStatus(projectId: string | number) {
    return runnerRequest<ProjectRepoStateVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository/status`);
  },
  refreshProjectRepositoryStatus(projectId: string | number) {
    return runnerRequest<ProjectRepoStateVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository/status/refresh`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  pushProjectRepository(projectId: string | number, input: { message?: string } = {}) {
    return runnerRequest<ProjectRepoStateVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository/push`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  syncProjectRepository(projectId: string | number) {
    return runnerRequest<ProjectRepoStateVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/repository/sync`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  updateProjectSkills(projectId: string | number) {
    return runnerRequest<ProjectSkillUpdateResultVO>(`/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/skills/update`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  listRequirements() {
    const centerFallback = () =>
      request<CenterRequirementVO[]>(`/api/ai-delivery/requirements?projectId=${encodeURIComponent(requireRemoteProjectId())}`)
        .then((items) => items.map(centerRequirementToWorkflow));
    return runnerRequest<RequirementWorkflow[]>(`/api/ai-delivery/requirements?projectId=${encodeURIComponent(requireRemoteProjectId())}`)
      .then((items) => {
        const normalized = normalizeRequirementWorkflows(items);
        saveWorkflowCache(normalized);
        return normalized;
      })
      .catch(() =>
        centerFallback()
          .then((items) => {
            saveWorkflowCache(items);
            return items;
          })
          .catch((error) => {
            const cached = loadWorkflowListCache();
            if (cached.length) {
              return cached;
            }
            throw error;
          })
      );
  },
  listAgents() {
    return runnerRequest<AgentProvider[]>('/api/ai-delivery/agents');
  },
  listMemoryCards(filter: MemoryCardFilter = {}) {
    return runnerRequest<MemoryPage<MemoryCard>>(`/api/ai-delivery/memory/cards${queryString(filter as Record<string, unknown>)}`);
  },
  createMemoryCard(input: MemoryCardCreateInput) {
    return runnerRequest<MemoryCard>('/api/ai-delivery/memory/cards', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateMemoryCard(memoryId: string, input: MemoryCardUpdateInput) {
    return runnerRequest<MemoryCard>(`/api/ai-delivery/memory/cards/${encodeURIComponent(memoryId)}`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getMemoryCard(memoryId: string) {
    return runnerRequest<MemoryCard>(`/api/ai-delivery/memory/cards/${encodeURIComponent(memoryId)}`);
  },
  listMemoryCardRevisions(memoryId: string) {
    return runnerRequest<MemoryCardRevision[]>(`/api/ai-delivery/memory/cards/${encodeURIComponent(memoryId)}/revisions`);
  },
  listMemoryCandidates(filter: MemoryCandidateFilter = {}) {
    return runnerRequest<MemoryPage<MemoryCandidate>>(`/api/ai-delivery/memory/candidates${queryString(filter as Record<string, unknown>)}`);
  },
  extractMemoryCandidates(input: { requirementId: string; runId?: string }) {
    return runnerRequest<MemoryCandidate[]>('/api/ai-delivery/memory/candidates/extract', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  confirmMemoryCandidate(candidateId: string, input: MemoryCandidateConfirmInput = {}) {
    return runnerRequest<MemoryCard>(`/api/ai-delivery/memory/candidates/${encodeURIComponent(candidateId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateMemoryCandidate(candidateId: string, input: MemoryCandidateUpdateInput) {
    return runnerRequest<MemoryCandidate>(`/api/ai-delivery/memory/candidates/${encodeURIComponent(candidateId)}`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  ignoreMemoryCandidate(candidateId: string, input: { reason?: string } = {}) {
    return runnerRequest<MemoryCandidate>(`/api/ai-delivery/memory/candidates/${encodeURIComponent(candidateId)}/ignore`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateMemoryCandidateStatus(candidateId: string, input: { status: MemoryCandidate['status']; reason?: string }) {
    return runnerRequest<MemoryCandidate>(`/api/ai-delivery/memory/candidates/${encodeURIComponent(candidateId)}/status`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  listMemoryRecalls(filter: MemoryRecallFilter = {}) {
    return runnerRequest<MemoryPage<MemoryRecallRecord>>(`/api/ai-delivery/memory/recalls${queryString(filter as Record<string, unknown>)}`);
  },
  getMemorySearchConfig() {
    return runnerRequest<MemorySearchConfig>('/api/ai-delivery/memory/search-config');
  },
  updateMemorySearchConfig(input: Partial<MemorySearchConfig>) {
    return runnerRequest<MemorySearchConfig>('/api/ai-delivery/memory/search-config', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  rebuildMemoryEmbeddings(input: { config?: Partial<MemorySearchConfig> } = {}) {
    return runnerRequest('/api/ai-delivery/memory/embeddings/rebuild', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  recallRequirementMemory(requirementId: string, input: { actionType?: ActionInput['actionType']; runId?: string; stage?: RequirementWorkflow['currentStage'] } = {}) {
    return runnerRequest<{ recallPath?: string; records: MemoryRecallRecord[] }>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/memory/recall`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  previewRequirementMemoryRecall(requirementId: string, input: {
    actionType?: ActionInput['actionType'];
    stage?: RequirementWorkflow['currentStage'];
    sourceFilePaths?: string[];
    clarification?: string;
    runIntent?: string;
  }) {
    return runnerRequest<MemoryRecallPreviewResult>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/memory/recall-preview`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  confirmRequirementMemoryRecall(requirementId: string, input: MemoryRecallConfirmInput) {
    return runnerRequest<{ recallPath?: string; records: MemoryRecallRecord[]; previewId?: string }>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/memory/recall-confirm`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  getRequirementRetrospective(requirementId: string) {
    return runnerRequest<RetrospectiveSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/retrospective`);
  },
  listProjectHistory() {
    return request<WorkflowProject[]>('/api/ai-delivery/project-history');
  },
  createRequirement(input: RequirementInput) {
    return runnerRequest<RequirementWorkflow>('/api/ai-delivery/requirements', {
      method: 'POST',
      body: JSON.stringify({
        id: input.id,
        projectId: Number(requireRemoteProjectId()),
        requirementId: input.requirementId,
        title: input.title || input.requirementId,
        requirementType: input.requirementType || 'REQUIREMENT',
        branchName: input.branchName,
        projects: input.projects || []
      })
    }).then(normalizeRequirementWorkflow);
  },
  getRequirement(requirementId: string) {
    const centerFallback = () =>
      request<CenterRequirementVO>(
        `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}?projectId=${encodeURIComponent(requireRemoteProjectId())}`
      ).then(centerRequirementToWorkflow);
    return runnerRequest<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}?projectId=${encodeURIComponent(requireRemoteProjectId())}`
    )
      .then((item) => {
        const normalized = normalizeRequirementWorkflow(item);
        saveWorkflowItemCache(normalized);
        return normalized;
      })
      .catch(() =>
        centerFallback()
          .then((workflow) => {
            saveWorkflowItemCache(workflow);
            return workflow;
          })
          .catch((error) => {
            const cached = loadWorkflowItemCache(requirementId);
            if (cached) {
              return cached;
            }
            throw error;
          })
      );
  },
  getOpenSpecSummary(requirementId: string, changeName: string) {
    return runnerRequest<OpenSpecSummary>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/openspec-summary?changeName=${encodeURIComponent(changeName)}`
    );
  },
  listOpenSpecVisualContextCandidates(requirementId: string) {
    return runnerRequest<{ candidates: OpenSpecVisualContextCandidate[] }>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/openspec-visual-context-candidates`
    );
  },
  updateOpenSpecTask(requirementId: string, input: { changeName: string; line: number; completed: boolean; raw: string }) {
    return runnerRequest<OpenSpecSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/openspec-tasks`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getGitChanges(requirementId: string) {
    return runnerRequest<GitChangeSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes`);
  },
  getGitDiffPreview(requirementId: string, input: { projectPath: string; filePath?: string; contextLines?: number }) {
    const params = new URLSearchParams({
      projectPath: input.projectPath,
      contextLines: String(input.contextLines || 3)
    });
    if (input.filePath) {
      params.set('filePath', input.filePath);
    }
    return runnerRequest<GitDiffPreview>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes/diff?${params.toString()}`);
  },
  getGitChangedFilePreview(requirementId: string, input: { projectPath: string; filePath: string; focusLine?: number }) {
    const params = new URLSearchParams({
      projectPath: input.projectPath,
      filePath: input.filePath
    });
    if (input.focusLine) {
      params.set('focusLine', String(input.focusLine));
    }
    return runnerRequest<GitFilePreview>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes/file?${params.toString()}`);
  },
  getAiCodeCompleteness(requirementId: string) {
    return runnerRequest<AiCodeCompletenessState>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/ai-completeness`);
  },
  calculateAiCodeCompleteness(requirementId: string, input: AiCodeCompletenessInput) {
    return runnerRequest<{ result: AiCodeCompletenessResult; workflow: RequirementWorkflow }>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/ai-completeness/calculate`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  captureAiCodeCompletenessAiCommit(requirementId: string) {
    return runnerRequest<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/ai-completeness/capture-ai-commit`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  },
  stageUntrackedFiles(requirementId: string, input: GitStageUntrackedInput) {
    return runnerRequest<GitChangeSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes/stage-untracked`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  planArtifactGitSync(requirementId: string, input: { stage: RequirementWorkflow['currentStage']; syncType?: ArtifactGitSyncPlan['syncType'] }) {
    return runnerRequest<ArtifactGitSyncPlan>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/artifact-git-syncs/plan`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  confirmArtifactGitSync(requirementId: string, input: ArtifactGitSyncConfirmInput) {
    return runnerRequest<ArtifactGitSyncConfirmResult>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/artifact-git-syncs/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  listRequirementWorkspaceStates(requirementPk: string | number) {
    return request<RequirementWorkspaceStateVO[]>(`/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/workspace-states`);
  },
  assertRequirementWritable(requirementPk: string | number, clientSessionId: string | number = getApiRuntimeConfig().clientSessionId) {
    return request<RequirementWorkspaceStateVO[]>(`/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/workspace-states/assert-writable`, {
      method: 'POST',
      body: JSON.stringify({ clientSessionId: Number(clientSessionId) })
    });
  },
  runAction(requirementId: string, input: ActionInput) {
    return runnerRequest<{ run: RunRecord; workflow: RequirementWorkflow }>('/api/ai-delivery/requirements/' + encodeURIComponent(requirementId) + '/actions', {
      method: 'POST',
      body: JSON.stringify(input)
    }).then((result) => ({
      ...result,
      workflow: normalizeRequirementWorkflow(result.workflow)
    }));
  },
  previewActionCommand(requirementId: string, input: ActionInput) {
    return runnerRequest<{ commandText: string }>('/api/ai-delivery/requirements/' + encodeURIComponent(requirementId) + '/actions/command', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateSupplementInputs(requirementId: string, input: SupplementInputsUpdate) {
    return runnerRequest<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/supplement-inputs`, {
      method: 'POST',
      body: JSON.stringify(input)
    }).then(normalizeRequirementWorkflow);
  },
  readArtifact(path: string, projectId?: string | number) {
    const params = new URLSearchParams({ path });
    if (projectId) {
      params.set('projectId', String(projectId));
    }
    return runnerRequest<{ artifact: ArtifactRef; content: string }>(`/api/ai-delivery/artifacts?${params.toString()}`);
  },
  createPublicArtifactShare(input: ArtifactShareCreateInput) {
    return runnerRequest<ArtifactShareVO>('/api/ai-delivery/artifact-shares/public', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  listPublicArtifactShares(input: { projectId: string | number; requirementId?: string; artifactPath?: string }) {
    const params = new URLSearchParams({ projectId: String(input.projectId) });
    if (input.requirementId) {
      params.set('requirementId', input.requirementId);
    }
    if (input.artifactPath) {
      params.set('artifactPath', input.artifactPath);
    }
    return runnerRequest<ArtifactShareVO[]>(`/api/ai-delivery/artifact-shares?${params.toString()}`);
  },
  revokePublicArtifactShare(shareId: string | number) {
    return request<ArtifactShareVO>(`/api/ai-delivery/artifact-shares/${encodeURIComponent(String(shareId))}/revoke`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  regeneratePublicArtifactShareToken(shareId: string | number) {
    return runnerRequest<ArtifactShareVO>(
      `/api/ai-delivery/artifact-shares/${encodeURIComponent(String(shareId))}/token/regenerate`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  },
  readPublicArtifactSharePreview(token: string) {
    return runnerRequest<PublicArtifactPreviewPayload>(
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/preview`
    );
  },
  listPublicTechDesignAnnotations(token: string, versionId?: string) {
    const suffix = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/tech-design-annotations${suffix}`
    );
  },
  createPublicTechDesignAnnotation(token: string, input: TechDesignAnnotationCreateInput) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/tech-design-annotations`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  createPublicTechDesignAnnotationReply(token: string, annotationId: string, input: TechDesignAnnotationReplyCreateInput) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/tech-design-annotations/${encodeURIComponent(annotationId)}/replies`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  deletePublicTechDesignAnnotationReply(token: string, annotationId: string, replyId: string) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/tech-design-annotations/${encodeURIComponent(annotationId)}/replies/${encodeURIComponent(replyId)}/delete`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  },
  deletePublicTechDesignAnnotation(token: string, annotationId: string) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/public-artifact-shares/${encodeURIComponent(token)}/tech-design-annotations/${encodeURIComponent(annotationId)}/delete`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  },
  listTechDesignVersions(requirementId: string) {
    return runnerRequest<{ versions: TechDesignVersion[] }>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-versions`);
  },
  readTechDesignVersion(requirementId: string, versionId: string) {
    return runnerRequest<TechDesignVersionContent>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-versions/${encodeURIComponent(versionId)}`
    );
  },
  diffTechDesignVersions(requirementId: string, input: TechDesignVersionDiffInput) {
    return runnerRequest<TechDesignVersionDiff>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-versions/diff`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  listTechDesignAnnotations(requirementId: string, versionId?: string) {
    const suffix = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations${suffix}`
    );
  },
  createTechDesignAnnotation(requirementId: string, input: TechDesignAnnotationCreateInput & { expectedHash?: string }) {
    return runnerRequest<TechDesignAnnotationList>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  createTechDesignAnnotationReply(requirementId: string, annotationId: string, input: TechDesignAnnotationReplyCreateInput) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations/${encodeURIComponent(annotationId)}/replies`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  deleteTechDesignAnnotationReply(requirementId: string, annotationId: string, replyId: string, input: TechDesignAnnotationDeleteInput = {}) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations/${encodeURIComponent(annotationId)}/replies/${encodeURIComponent(replyId)}/delete`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  updateTechDesignAnnotationStatus(requirementId: string, annotationId: string, input: TechDesignAnnotationStatusInput & { expectedHash?: string }) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations/${encodeURIComponent(annotationId)}/status`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  deleteTechDesignAnnotation(requirementId: string, annotationId: string, input: TechDesignAnnotationDeleteInput = {}) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations/${encodeURIComponent(annotationId)}/delete`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  },
  rebuildTechDesignAnnotationSummary(requirementId: string) {
    return runnerRequest<TechDesignAnnotationList>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-annotations/rebuild-summary`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  },
  saveArtifact(path: string, content: string, expectedHash?: string, baseVersionId?: string | number) {
    return runnerRequest<{ artifact: { hash?: string; updatedAt?: string; currentVersionId?: string | number; versionId?: string | number }; content: string }>(
      '/api/ai-delivery/artifacts',
      {
      method: 'POST',
      body: JSON.stringify({ path, content, expectedHash, baseVersionId })
      }
    );
  },
  submitReview(input: ReviewSubmissionInput) {
    const requirementPk = Number(input.requirementPk);
    if (Number.isSafeInteger(requirementPk) && requirementPk > 0) {
      return request<CenterReviewVO>('/api/ai-delivery/reviews', {
        method: 'POST',
        body: JSON.stringify({
          requirementPk,
          stage: input.stage,
          implementationStep: input.implementationStep,
          decision: input.decision,
          comment: input.comment
        })
      });
    }
    return runnerRequest<RequirementWorkflow>('/api/ai-delivery/reviews', {
      method: 'POST',
      body: JSON.stringify({
        requirementId: input.requirementId,
        stage: input.stage,
        implementationStep: input.implementationStep,
        decision: input.decision,
        comment: input.comment,
        actor: input.actor,
        artifactPath: input.artifactPath
      })
    }).then(normalizeRequirementWorkflow);
  },
  getRunTokenUsages(requirementId: string, runId: string | number) {
    if (isCenterRunId(runId)) {
      return request<RunTokenUsageRun>(`/api/ai-delivery/runs/${encodeURIComponent(String(runId))}/token-usages`)
        .then((value) => normalizeRunTokenUsage(runId, value));
    }
    return runnerRequest<RunEvent[]>(`/api/ai-delivery/runs/${encodeURIComponent(String(runId))}/events?requirementId=${encodeURIComponent(requirementId)}`)
      .then((events) => runEventsToTokenUsage(runId, events))
      .catch(() => emptyRunTokenUsage(runId));
  },
  getRequirementTokenUsageSummary(requirementPk: string | number) {
    if (!isCenterRunId(requirementPk)) {
      return Promise.resolve(emptyRequirementTokenUsage(requirementPk));
    }
    return request<RequirementTokenUsageSummary>(
      `/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/token-usage-summary`
    ).then((value) => normalizeRequirementTokenUsage(requirementPk, value));
  },
  getRequirementTokenUsageDetails(requirementPk: string | number, page = 1, pageSize = 20) {
    if (!isCenterRunId(requirementPk)) {
      return Promise.resolve({ requirementPk, page, pageSize, total: 0, items: [] } as RequirementTokenUsagePage);
    }
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<RequirementTokenUsagePage>(
      `/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/token-usages?${params.toString()}`
    ).then((value) => normalizeRequirementTokenUsagePage(requirementPk, page, pageSize, value));
  },
  listProjectTokenUsageSummaries(projectId: string | number) {
    if (!projectId || !isCenterRunId(projectId)) {
      return Promise.resolve([] as RequirementTokenUsageSummary[]);
    }
    return request<RequirementTokenUsageSummary[]>(
      `/api/ai-delivery/projects/${encodeURIComponent(String(projectId))}/token-usage-summaries`
    ).then((items) => items.map((item) => normalizeRequirementTokenUsage(item.requirementPk || '', item)));
  },
  getRunEvents(requirementId: string, runId: string) {
    if (isCenterRunId(runId)) {
      return request<CenterRunEventVO[]>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/events?afterSeq=0`)
        .then((items) => items.map(centerRunEventToRunEvent));
    }
    return runnerRequest<RunEvent[]>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/events?requirementId=${encodeURIComponent(requirementId)}`);
  },
  cancelRun(requirementId: string, runId: string) {
    return runnerRequest<{ cancelled: boolean }>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ requirementId })
    });
  },
  openRunEventStream(requirementId: string, runId: string) {
    const runtime = getApiRuntimeConfig();
    const params = new URLSearchParams({
      requirementId,
      tail: '1'
    });
    if (runtime.projectId) {
      params.set('projectId', runtime.projectId);
    }
    if (runtime.clientSessionId) {
      params.set('clientSessionId', runtime.clientSessionId);
    }
    if (runtime.userId) {
      params.set('userId', runtime.userId);
    }
    if (runtime.centerBaseUrl) {
      params.set('centerBaseUrl', runtime.centerBaseUrl);
    }
    return new EventSource(resolveRunnerApiUrl(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/stream?${params.toString()}`));
  },
  createWsTicket(clientSessionId?: string | number) {
    const runtime = getApiRuntimeConfig();
    const resolvedClientSessionId = clientSessionId || runtime.clientSessionId;
    if (!resolvedClientSessionId) {
      throw new Error('缺少中心服务 clientSessionId');
    }
    return request<CenterWsTicketVO>('/api/ai-delivery/ws-tickets', {
      method: 'POST',
      body: JSON.stringify({ clientSessionId: Number(resolvedClientSessionId) })
    });
  },
  uploadPrdFiles(requirementId: string, files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return runnerRequest<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/prd-files`, {
      method: 'POST',
      body: formData
    }).then(normalizeRequirementWorkflow);
  },
  deletePrdFile(requirementId: string, fileId: string) {
    return runnerRequest<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/prd-files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE'
      }
    ).then(normalizeRequirementWorkflow);
  },
  uploadTechDesignFiles(requirementId: string, files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return runnerRequest<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-files`, {
      method: 'POST',
      body: formData
    }).then(normalizeRequirementWorkflow);
  },
  deleteTechDesignFile(requirementId: string, fileId: string) {
    return runnerRequest<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE'
      }
    ).then(normalizeRequirementWorkflow);
  },
  deleteTechDesignQuestion(requirementId: string, input: DeleteTechDesignQuestionInput) {
    return runnerRequest<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-questions`, {
      method: 'DELETE',
      body: JSON.stringify(input)
    }).then(normalizeRequirementWorkflow);
  },
  getSettings() {
    return request<{ projectPaths: string[] }>('/api/ai-delivery/settings');
  },
  saveSettings(projectPaths: string[]) {
    return request<{ projectPaths: string[] }>('/api/ai-delivery/settings', {
      method: 'PUT',
      body: JSON.stringify({ projectPaths })
    });
  },
  listProjects() {
    return request<WorkflowProject[]>('/api/ai-delivery/projects');
  },
  registerClientSession(input: { osType: string; capabilities?: string[] }) {
    return request<ClientSessionVO>('/api/ai-delivery/client-sessions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }
};
