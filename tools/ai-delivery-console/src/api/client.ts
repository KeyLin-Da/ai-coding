import type { ActionInput, AgentProvider, OpenSpecSummary, RequirementInput, RequirementWorkflow, ReviewInput, RunEvent } from '@shared/workflow';

interface ApiResult<T> {
  data: T;
  message?: string;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(url, {
    headers: isFormData
      ? options.headers
      : {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
    ...options
  });
  const body = (await response.json()) as ApiResult<T>;
  if (!response.ok) {
    throw new Error(body.message || '请求失败');
  }
  return body.data;
}

export const apiClient = {
  listRequirements() {
    return request<RequirementWorkflow[]>('/api/ai-delivery/requirements');
  },
  listAgents() {
    return request<AgentProvider[]>('/api/ai-delivery/agents');
  },
  createRequirement(input: RequirementInput) {
    return request<RequirementWorkflow>('/api/ai-delivery/requirements', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getRequirement(requirementId: string) {
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
  runAction(requirementId: string, input: ActionInput) {
    return request<{ workflow: RequirementWorkflow }>('/api/ai-delivery/requirements/' + encodeURIComponent(requirementId) + '/actions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  readArtifact(path: string) {
    return request<{ artifact: { hash?: string; updatedAt?: string }; content: string }>(`/api/ai-delivery/artifacts?path=${encodeURIComponent(path)}`);
  },
  saveArtifact(path: string, content: string, expectedHash?: string) {
    return request<{ artifact: { hash?: string; updatedAt?: string }; content: string }>('/api/ai-delivery/artifacts', {
      method: 'POST',
      body: JSON.stringify({ path, content, expectedHash })
    });
  },
  submitReview(input: ReviewInput) {
    return request<RequirementWorkflow>('/api/ai-delivery/reviews', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getRunEvents(requirementId: string, runId: string) {
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
  }
};
