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
  WorkflowProject
} from '@shared/workflow';
import { createEmptyStages } from '@shared/workflow';
import { apiRuntimeHeaders, getApiRuntimeConfig, isRemoteApiMode, resolveApiUrl } from './runtime';
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
}

interface CenterRunEventVO {
  id?: number;
  runId: number;
  seq: number;
  level: RunEvent['level'];
  type: 'stdout' | 'stderr' | 'exit' | 'cancelled';
  message: string;
  textObjectId?: number;
  payloadJson?: string;
  createdAt?: string;
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

function requireRemoteProjectId(): string {
  const projectId = getApiRuntimeConfig().projectId;
  if (!projectId) {
    throw new Error('缺少中心服务 projectId');
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
  const typeMap: Record<CenterRunEventVO['type'], RunEvent['type']> = {
    stdout: 'STDOUT',
    stderr: 'STDERR',
    exit: 'EXIT',
    cancelled: 'CANCELLED'
  };
  return {
    time: item.createdAt || new Date().toISOString(),
    type: typeMap[item.type] || 'INFO',
    level: item.level,
    message: item.message,
    text: item.message,
    data: item.textObjectId
      ? {
          textObjectId: item.textObjectId,
          payloadJson: item.payloadJson
        }
      : item.payloadJson
  };
}

export const apiClient = {
  listRequirements() {
    if (isRemoteApiMode()) {
      return request<CenterRequirementVO[]>(`/api/ai-delivery/requirements?projectId=${encodeURIComponent(requireRemoteProjectId())}`)
        .then((items) => items.map(centerRequirementToWorkflow))
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
        });
    }
    return request<RequirementWorkflow[]>('/api/ai-delivery/requirements');
  },
  listAgents() {
    return request<AgentProvider[]>('/api/ai-delivery/agents');
  },
  listProjectHistory() {
    return request<WorkflowProject[]>('/api/ai-delivery/project-history');
  },
  createRequirement(input: RequirementInput) {
    if (isRemoteApiMode()) {
      return request<CenterRequirementVO>('/api/ai-delivery/requirements', {
        method: 'POST',
        body: JSON.stringify({
          projectId: Number(requireRemoteProjectId()),
          requirementId: input.requirementId,
          title: input.title || input.requirementId,
          requirementType: input.requirementType || 'REQUIREMENT',
          branchName: input.branchName
        })
      }).then(centerRequirementToWorkflow);
    }
    return request<RequirementWorkflow>('/api/ai-delivery/requirements', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getRequirement(requirementId: string) {
    if (isRemoteApiMode()) {
      return request<CenterRequirementVO>(
        `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}?projectId=${encodeURIComponent(requireRemoteProjectId())}`
      )
        .then(centerRequirementToWorkflow)
        .then((item) => {
          saveWorkflowItemCache(item);
          return item;
        })
        .catch((error) => {
          const cached = loadWorkflowItemCache(requirementId);
          if (cached) {
            return cached;
          }
          throw error;
        });
    }
    return request<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}`);
  },
  getOpenSpecSummary(requirementId: string, changeName: string) {
    return request<OpenSpecSummary>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/openspec-summary?changeName=${encodeURIComponent(changeName)}`
    );
  },
  updateOpenSpecTask(requirementId: string, input: { changeName: string; line: number; completed: boolean; raw: string }) {
    return request<OpenSpecSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/openspec-tasks`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getGitChanges(requirementId: string) {
    return request<GitChangeSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes`);
  },
  stageUntrackedFiles(requirementId: string, input: GitStageUntrackedInput) {
    return request<GitChangeSummary>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/git-changes/stage-untracked`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  runAction(requirementId: string, input: ActionInput) {
    return request<{ run: RunRecord; workflow: RequirementWorkflow }>('/api/ai-delivery/requirements/' + encodeURIComponent(requirementId) + '/actions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  previewActionCommand(requirementId: string, input: ActionInput) {
    return request<{ commandText: string }>('/api/ai-delivery/requirements/' + encodeURIComponent(requirementId) + '/actions/command', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  readArtifact(path: string) {
    return request<{ artifact: { hash?: string; updatedAt?: string; currentVersionId?: string | number; versionId?: string | number }; content: string }>(
      `/api/ai-delivery/artifacts?path=${encodeURIComponent(path)}`
    );
  },
  saveArtifact(path: string, content: string, expectedHash?: string, baseVersionId?: string | number) {
    return request<{ artifact: { hash?: string; updatedAt?: string; currentVersionId?: string | number; versionId?: string | number }; content: string }>(
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
    if (isRemoteApiMode()) {
      return request<CenterRunEventVO[]>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/events?afterSeq=0`).then((items) =>
        items.map(centerRunEventToRunEvent)
      );
    }
    return request<RunEvent[]>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/events?requirementId=${encodeURIComponent(requirementId)}`);
  },
  cancelRun(requirementId: string, runId: string) {
    return request<{ cancelled: boolean }>(`/api/ai-delivery/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ requirementId })
    });
  },
  uploadPrdFiles(requirementId: string, files: File[]) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return request<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/prd-files`, {
      method: 'POST',
      body: formData
    });
  },
  deletePrdFile(requirementId: string, fileId: string) {
    return request<RequirementWorkflow>(
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
    return request<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-files`, {
      method: 'POST',
      body: formData
    });
  },
  deleteTechDesignFile(requirementId: string, fileId: string) {
    return request<RequirementWorkflow>(
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE'
      }
    );
  },
  deleteTechDesignQuestion(requirementId: string, input: DeleteTechDesignQuestionInput) {
    return request<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}/tech-design-questions`, {
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
  }
};
