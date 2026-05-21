import type { ActionInput, RequirementInput, RequirementWorkflow, ReviewInput, RunEvent } from '@shared/workflow';

interface ApiResult<T> {
  data: T;
  message?: string;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
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
  createRequirement(input: RequirementInput) {
    return request<RequirementWorkflow>('/api/ai-delivery/requirements', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  getRequirement(requirementId: string) {
    return request<RequirementWorkflow>(`/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}`);
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
  }
};
