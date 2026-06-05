import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { apiClient } from '../../src/api/client';
import { setApiRuntimeConfig } from '../../src/api/runtime';
import { saveWorkflowCache } from '../../src/services/workflow-cache';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '缓存需求',
    sources: [],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('workflow-cache', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) || null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear()
      }
    });
    setApiRuntimeConfig({
      mode: 'remote',
      centerBaseUrl: 'https://center.example.com',
      userId: '1',
      projectId: '10'
    });
  });

  it('中心服务不可用时读取本地只读 workflow 缓存', async () => {
    saveWorkflowCache([workflow()]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await apiClient.listRequirements();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('缓存需求');
  });
});
