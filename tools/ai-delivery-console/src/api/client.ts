import type {
  ActionInput,
  AgentProvider,
  GitChangeSummary,
  GitStageUntrackedInput,
  OpenSpecSummary,
  RequirementInput,
  RequirementWorkflow,
  ReviewInput,
  RunEvent,
  RunRecord,
  TechDesignAnnotationCreateInput,
  TechDesignAnnotationDeleteInput,
  TechDesignAnnotationList,
  TechDesignAnnotationStatusInput,
  TechDesignVersion,
  TechDesignVersionContent,
  TechDesignVersionDiff,
  TechDesignVersionDiffInput,
  WorkflowProject
} from '@shared/workflow';
import { createEmptyStages } from '@shared/workflow';
import { apiRuntimeHeaders, getApiRuntimeConfig, resolveApiUrl, resolveRunnerApiUrl } from './runtime';
import { loadWorkflowItemCache, loadWorkflowListCache, saveWorkflowCache, saveWorkflowItemCache } from '@/services/workflow-cache';

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

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(resolveApiUrl(url), {
    headers: isFormData
      ? {
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        }
      : {
          'Content-Type': 'application/json',
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        },
    ...options
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
    headers: isFormData
      ? {
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        }
      : {
          'Content-Type': 'application/json',
          ...apiRuntimeHeaders(),
          ...(options.headers || {})
        },
    ...options
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
  return {
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
  };
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
        saveWorkflowCache(items);
        return items;
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
  listProjectHistory() {
    return request<WorkflowProject[]>('/api/ai-delivery/project-history');
  },
  createRequirement(input: RequirementInput) {
    return request<CenterRequirementVO>('/api/ai-delivery/requirements', {
      method: 'POST',
      body: JSON.stringify({
        projectId: Number(requireRemoteProjectId()),
        requirementId: input.requirementId,
        title: input.title || input.requirementId,
        requirementType: input.requirementType || 'REQUIREMENT',
        branchName: input.branchName,
        projectNames: (input.projects || []).map((p) => p.name)
      })
    }).then(centerRequirementToWorkflow);
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
        saveWorkflowItemCache(item);
        return item;
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
  updateOpenSpecTask(requirementId: string, input: { changeName: string; line: number; completed: boolean; raw: string }) {
    return runnerRequest<OpenSpecSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/openspec-tasks`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getGitChanges(requirementId: string) {
    return runnerRequest<GitChangeSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes`);
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
    });
  },
  previewActionCommand(requirementId: string, input: ActionInput) {
    return runnerRequest<{ commandText: string }>('/api/ai-delivery/requirements/' + encodeURIComponent(requirementId) + '/actions/command', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  readArtifact(path: string) {
    return runnerRequest<{ artifact: { hash?: string; updatedAt?: string; currentVersionId?: string | number; versionId?: string | number }; content: string }>(
      `/api/ai-delivery/artifacts?path=${encodeURIComponent(path)}`
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
  submitReview(input: ReviewInput) {
    return request<RequirementWorkflow>('/api/ai-delivery/reviews', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getRunEvents(requirementId: string, runId: string) {
    return request<CenterRunEventVO[]>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/events?afterSeq=0`)
      .then((items) => items.map(centerRunEventToRunEvent));
  },
  cancelRun(requirementId: string, runId: string) {
    return runnerRequest<{ cancelled: boolean }>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ requirementId })
    });
  },
  openRunEventStream(requirementId: string, runId: string) {
    void requirementId;
    void runId;
    throw new Error('运行日志实时订阅已迁移到中心 WebSocket');
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
    });
  },
  deletePrdFile(requirementId: string, fileId: string) {
    return runnerRequest<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/prd-files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE'
      }
    );
  },
  uploadTechDesignFiles(requirementId: string, files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return runnerRequest<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-files`, {
      method: 'POST',
      body: formData
    });
  },
  deleteTechDesignFile(requirementId: string, fileId: string) {
    return runnerRequest<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE'
      }
    );
  },
  deleteTechDesignQuestion(requirementId: string, input: DeleteTechDesignQuestionInput) {
    return runnerRequest<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-questions`, {
      method: 'DELETE',
      body: JSON.stringify(input)
    });
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
