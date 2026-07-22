import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ElementPlus from 'element-plus';
import ProjectMemory from '../../src/views/ProjectMemory.vue';
import { apiClient } from '@/api/client';
import { useProjectStore } from '@/stores/project';

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    listMemoryCards: vi.fn(),
    createMemoryCard: vi.fn(),
    updateMemoryCard: vi.fn(),
    listMemoryCardRevisions: vi.fn(),
    listMemoryCandidates: vi.fn(),
    listMemoryRecalls: vi.fn(),
    confirmMemoryCandidate: vi.fn(),
    updateMemoryCandidateStatus: vi.fn(),
    ignoreMemoryCandidate: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn()
    }
  };
});

describe('ProjectMemory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const project = useProjectStore();
    project.current = {
      id: 10,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    vi.mocked(apiClient.listMemoryCards).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    vi.mocked(apiClient.createMemoryCard).mockResolvedValue({} as any);
    vi.mocked(apiClient.updateMemoryCard).mockResolvedValue({} as any);
    vi.mocked(apiClient.listMemoryCardRevisions).mockResolvedValue([]);
    vi.mocked(apiClient.listMemoryRecalls).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
  });

  it('展示待确认经验并支持确认沉淀', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.current = {
      id: 10,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    vi.mocked(apiClient.listMemoryCandidates).mockResolvedValue({
      items: [
        {
          id: 'cand-1',
          projectId: '10',
          requirementId: '174705',
          sourceKey: 'source-1',
          sourceType: 'CLARIFICATION',
          sourceRunId: 'run-1',
          sourceText: 'nacos 公共配置接口可以复用',
          statement: 'nacos 公共配置接口可以复用',
          type: 'TECH_EXPERIENCE',
          status: 'PENDING_CONFIRM',
          confidence: 0.7,
          tags: ['nacos'],
          appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
          evidence: [{ sourceType: 'CLARIFICATION', requirementId: '174705', quote: 'nacos 公共配置接口可以复用', runId: 'run-1' }],
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 50
    });
    vi.mocked(apiClient.confirmMemoryCandidate).mockResolvedValue({} as any);

    const wrapper = mount(ProjectMemory, {
      props: { view: 'candidates' },
      global: {
        plugins: [pinia, ElementPlus]
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('nacos 公共配置接口可以复用');
    await wrapper.findAll('button').find((button) => button.text().includes('确认'))?.trigger('click');
    await flushPromises();

    expect(apiClient.confirmMemoryCandidate).toHaveBeenCalledWith('cand-1');
  });

  it('经验库为空时展示空状态', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.current = {
      id: 10,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    const wrapper = mount(ProjectMemory, {
      props: { view: 'cards' },
      global: {
        plugins: [pinia, ElementPlus]
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('暂无项目记忆数据');
  });

  it('支持人工录入项目经验', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.current = {
      id: 10,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    const wrapper = mount(ProjectMemory, {
      props: { view: 'cards' },
      global: {
        plugins: [pinia, ElementPlus]
      }
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text().includes('新建经验'))?.trigger('click');
    (wrapper.vm as any).manualForm.statement = '涉及 nacos 配置读取时，优先检查公共配置接口是否可复用';
    (wrapper.vm as any).manualForm.tags = 'nacos,配置';
    (wrapper.vm as any).manualForm.modules = 'opp-learn';
    await (wrapper.vm as any).createManualMemory();
    await flushPromises();

    expect(apiClient.createMemoryCard).toHaveBeenCalledWith(expect.objectContaining({
      projectId: '10',
      statement: '涉及 nacos 配置读取时，优先检查公共配置接口是否可复用',
      type: 'TECH_EXPERIENCE',
      status: 'ACTIVE',
      tags: ['nacos', '配置'],
      appliesTo: expect.objectContaining({
        modules: ['opp-learn'],
        stages: ['TECH_DESIGN']
      })
    }));
  });

  it('支持编辑项目经验', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.current = {
      id: 10,
      name: 'OPP',
      code: 'opp',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    vi.mocked(apiClient.listMemoryCards).mockResolvedValue({
      items: [
        {
          id: 'mem-1',
          projectId: '10',
          statement: 'nacos 配置读取优先复用公共接口',
          type: 'TECH_EXPERIENCE',
          status: 'ACTIVE',
          confidence: 0.8,
          tags: ['nacos'],
          appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
          evidence: [{ sourceType: 'MANUAL', requirementId: '', quote: '人工录入' }],
          createdAt: '2026-07-03T00:00:00.000Z',
          updatedAt: '2026-07-03T00:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 50
    });

    const wrapper = mount(ProjectMemory, {
      props: { view: 'cards' },
      global: {
        plugins: [pinia, ElementPlus]
      }
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text().includes('编辑'))?.trigger('click');
    (wrapper.vm as any).manualForm.statement = 'opp-learn 涉及 nacos 配置读取时，优先复用公共配置接口';
    (wrapper.vm as any).manualForm.status = 'PENDING_VERIFY';
    (wrapper.vm as any).manualForm.changeReason = '补充工程范围';
    await (wrapper.vm as any).createManualMemory();
    await flushPromises();

    expect(apiClient.updateMemoryCard).toHaveBeenCalledWith('mem-1', expect.objectContaining({
      statement: 'opp-learn 涉及 nacos 配置读取时，优先复用公共配置接口',
      status: 'PENDING_VERIFY',
      changeReason: '补充工程范围'
    }));
  });
});
