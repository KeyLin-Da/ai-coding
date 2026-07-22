import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyStages, type AgentProvider, type RequirementWorkflow } from '../../shared/workflow';
import { useWorkflowStore } from '@/stores/workflow';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    listAgents: vi.fn(),
    listRequirements: vi.fn(),
    getRequirement: vi.fn(),
    submitReview: vi.fn(),
    captureAiCodeCompletenessAiCommit: vi.fn(),
    updateSupplementInputs: vi.fn(),
    uploadTechDesignFiles: vi.fn()
  }
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
  }
}));

function workflow(id: string, lastEventId?: string | number): RequirementWorkflow {
  return {
    id,
    requirementId: id,
    title: `需求 ${id}`,
    requirementType: 'REQUIREMENT',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: [],
    lastEventId
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('workflow store loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('从后端 API 加载 Agent Provider', async () => {
    const agents: AgentProvider[] = [
      {
        id: 'codex',
        name: 'Codex',
        inputMode: 'STDIN',
        available: true,
        supportsStreaming: true
      },
      {
        id: 'codebuddy',
        name: 'CodeBuddy',
        inputMode: 'STDIN',
        available: true,
        supportsStreaming: true
      }
    ];
    vi.mocked(apiClient.listAgents).mockResolvedValue(agents);
    const store = useWorkflowStore();

    await store.loadAgents();

    expect(apiClient.listAgents).toHaveBeenCalledTimes(1);
    expect(store.agents).toEqual(agents);
  });

  it('同一个需求详情请求进行中时复用同一个 Promise 并记录 lastEventId', async () => {
    const pending = deferred<RequirementWorkflow>();
    vi.mocked(apiClient.getRequirement).mockReturnValue(pending.promise);
    const store = useWorkflowStore();

    const first = store.loadRequirement('172014');
    const second = store.loadRequirement('172014');
    pending.resolve(workflow('172014', 42));
    await Promise.all([first, second]);

    expect(apiClient.getRequirement).toHaveBeenCalledTimes(1);
    expect(store.current?.title).toBe('需求 172014');
    expect(store.lastEventId).toBe(42);
  });

  it('需求列表请求进行中时复用同一个 Promise 并取最大的 lastEventId', async () => {
    const pending = deferred<RequirementWorkflow[]>();
    vi.mocked(apiClient.listRequirements).mockReturnValue(pending.promise);
    const store = useWorkflowStore();

    const first = store.loadRequirements();
    const second = store.loadRequirements();
    pending.resolve([workflow('172014', 7), workflow('172015', 12)]);
    await Promise.all([first, second]);

    expect(apiClient.listRequirements).toHaveBeenCalledTimes(1);
    expect(store.requirements).toHaveLength(2);
    expect(store.lastEventId).toBe(12);
  });

  it('普通审核成功后重新加载当前需求和列表而不使用 Review 响应覆盖 current', async () => {
    const store = useWorkflowStore();
    const current = workflow('172014');
    const refreshed = {
      ...current,
      title: '刷新后的需求',
      stages: {
        ...current.stages,
        IMPLEMENTATION: {
          stage: 'IMPLEMENTATION' as const,
          status: 'IN_PROGRESS' as const
        }
      }
    };
    store.current = current;
    vi.mocked(apiClient.submitReview).mockResolvedValue({
      id: 501,
      requirementPk: 100,
      stage: 'IMPLEMENTATION',
      implementationStep: 'CHANGE_INSPECTION',
      decision: 'APPROVED'
    });
    vi.mocked(apiClient.captureAiCodeCompletenessAiCommit).mockResolvedValue(current);
    vi.mocked(apiClient.getRequirement).mockResolvedValue(refreshed);
    vi.mocked(apiClient.listRequirements).mockResolvedValue([refreshed]);

    await store.submitReview({
      stage: 'IMPLEMENTATION',
      implementationStep: 'CHANGE_INSPECTION',
      decision: 'APPROVED',
      comment: '子步骤通过'
    });

    expect(apiClient.submitReview).toHaveBeenCalledWith({
      requirementId: '172014',
      requirementPk: '172014',
      stage: 'IMPLEMENTATION',
      implementationStep: 'CHANGE_INSPECTION',
      decision: 'APPROVED',
      comment: '子步骤通过'
    });
    expect(apiClient.captureAiCodeCompletenessAiCommit).toHaveBeenCalledWith('172014');
    expect(apiClient.getRequirement).toHaveBeenCalledWith('172014');
    expect(apiClient.listRequirements).toHaveBeenCalledTimes(1);
    expect(store.current?.title).toBe('刷新后的需求');
    expect(store.current).not.toHaveProperty('requirementPk');
  });

  it('保存补充输入后局部合并当前需求和列表，不重新加载需求列表', async () => {
    const store = useWorkflowStore();
    const current = workflow('172014', 7);
    const other = workflow('172015', 8);
    const updated = {
      ...current,
      title: '已更新补充输入',
      techDesignClarification: '补充上下文',
      lastEventId: 15
    };
    store.current = current;
    store.requirements = [current, other];
    vi.mocked(apiClient.updateSupplementInputs).mockResolvedValue(updated);

    await store.updateSupplementInputs({ techDesignClarification: '补充上下文' });

    expect(apiClient.updateSupplementInputs).toHaveBeenCalledWith('172014', { techDesignClarification: '补充上下文' });
    expect(apiClient.listRequirements).not.toHaveBeenCalled();
    expect(store.current).toEqual(updated);
    expect(store.requirements).toEqual([updated, other]);
    expect(store.lastEventId).toBe(15);
  });

  it('上传技术方案补充材料后局部合并当前需求和列表，不重新加载需求列表', async () => {
    const store = useWorkflowStore();
    const current = workflow('172014', 7);
    const other = workflow('172015', 8);
    const file = new File(['# design'], 'supplement.md', { type: 'text/markdown' });
    const updated = {
      ...current,
      techDesignSourceFiles: [
        {
          id: 'file-1',
          name: 'supplement.md',
          path: 'docs/172014/technical-design/file/supplement.md',
          size: 8,
          mimeType: 'text/markdown',
          uploadedAt: '2026-07-16T00:00:00.000Z'
        }
      ],
      lastEventId: 16
    };
    store.current = current;
    store.requirements = [current, other];
    vi.mocked(apiClient.uploadTechDesignFiles).mockResolvedValue(updated);

    await store.uploadTechDesignFiles([file]);

    expect(apiClient.uploadTechDesignFiles).toHaveBeenCalledWith('172014', [file]);
    expect(apiClient.listRequirements).not.toHaveBeenCalled();
    expect(store.current).toEqual(updated);
    expect(store.requirements).toEqual([updated, other]);
    expect(store.lastEventId).toBe(16);
  });
});
