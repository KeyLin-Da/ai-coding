import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import RequirementList from '../../src/views/RequirementList.vue';
import { apiClient } from '@/api/client';
import { useSettingsStore } from '@/stores/settings';
import { useProjectStore } from '@/stores/project';
import { ElMessage } from 'element-plus';

const routerPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush
  })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    listRequirements: vi.fn(),
    listProjectHistory: vi.fn(),
    listProjects: vi.fn(),
    createRequirement: vi.fn(),
    getAiCodeCompleteness: vi.fn(),
    calculateAiCodeCompleteness: vi.fn(),
    listProjectTokenUsageSummaries: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn()
    }
  };
});

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '旧标题',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp-172014',
    projects: [
      {
        name: 'opp-api',
        path: 'opp-api'
      }
    ],
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

function componentStubs() {
  return {
    ElButton: {
      props: ['disabled'],
      template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
    },
    ElDialog: {
      props: ['title'],
      template: '<section><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>'
    },
    ElForm: { template: '<form><slot /></form>' },
    ElFormItem: {
      props: ['label'],
      template: '<label><span>{{ label }}</span><slot /></label>'
    },
    ElInput: {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue', 'input'],
      template:
        '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)" />'
    },
    ElOption: {
      props: ['label', 'value'],
      template: '<option :value="value">{{ label }}</option>'
    },
    ElOptionGroup: {
      template: '<optgroup><slot /></optgroup>'
    },
    ElRadioButton: {
      props: ['value'],
      template: '<button type="button" :value="value"><slot /></button>'
    },
    ElRadioGroup: {
      props: ['modelValue', 'disabled'],
      template: '<div :data-disabled="disabled"><slot /></div>'
    },
    ElSelect: {
      template: '<select multiple><slot /></select>'
    },
    ElPagination: {
      props: ['currentPage', 'pageSize', 'total'],
      emits: ['update:currentPage', 'update:pageSize'],
      template: '<nav>{{ total }}</nav>'
    },
    ElAlert: {
      props: ['title'],
      template: '<div>{{ title }}</div>'
    },
    ElTable: { template: '<div><slot /></div>' },
    ElTableColumn: { template: '<div />' },
    ElTag: { template: '<span><slot /></span>' },
    ElTooltip: { template: '<span><slot /></span>' }
  };
}

async function mountList(current: RequirementWorkflow | RequirementWorkflow[] = workflow()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.desktopConfig = {
    ...settings.desktopConfig,
    centerBaseUrl: 'http://127.0.0.1:8728',
    userId: '1',
    projectId: '10',
    clientSessionId: '100'
  };
  settings.projectPaths = ['opp-api', 'opp-diy'];
  const workflows = Array.isArray(current) ? current : [current];
  vi.mocked(apiClient.listRequirements).mockResolvedValue(workflows);
  vi.mocked(apiClient.listProjectHistory).mockResolvedValue([
    {
      name: 'opp-api',
      path: 'opp-api'
    },
    {
      name: 'opp-diy',
      path: 'opp-diy'
    }
  ]);
  vi.mocked(apiClient.listProjects).mockResolvedValue([
    {
      name: 'opp-api',
      path: 'opp-api'
    },
    {
      name: 'opp-diy',
      path: 'opp-diy'
    }
  ]);
  vi.mocked(apiClient.createRequirement).mockResolvedValue({
    ...workflows[0],
    title: '新标题',
    branchName: 'feature/opp-172014-edit',
    projects: [
      {
        name: 'opp-api',
        path: 'opp-api'
      },
      {
        name: 'opp-diy',
        path: 'opp-diy'
      }
    ]
  });
  vi.mocked(apiClient.getAiCodeCompleteness).mockResolvedValue({
    status: 'NOT_READY',
    projects: workflows[0].projects?.map((project) => ({
      projectName: project.name,
      projectPath: project.path
    })) || []
  });
  vi.mocked(apiClient.calculateAiCodeCompleteness).mockResolvedValue({
    result: {
      requirementId: workflows[0].requirementId,
      status: 'CALCULATED',
      projects: [],
      summary: {
        aiAdditions: 10,
        aiDeletions: 0,
        aiChangeLines: 10,
        aiChangedFiles: 1,
        followUpAdditions: 2,
        followUpDeletions: 0,
        followUpChangeLines: 2,
        followUpChangedFiles: 1,
        stableAiFiles: 0,
        completenessRate: 83.333,
        followUpAdjustmentRate: 20,
        aiFileStabilityRate: 0
      }
    },
    workflow: {
      ...workflows[0],
      aiCodeCompleteness: {
        status: 'CALCULATED',
        projects: [],
        summary: {
          aiAdditions: 10,
          aiDeletions: 0,
          aiChangeLines: 10,
          aiChangedFiles: 1,
          followUpAdditions: 2,
          followUpDeletions: 0,
          followUpChangeLines: 2,
          followUpChangedFiles: 1,
          stableAiFiles: 0,
          completenessRate: 83.333,
          followUpAdjustmentRate: 20,
          aiFileStabilityRate: 0
        }
      }
    }
  });
  vi.mocked(apiClient.listProjectTokenUsageSummaries).mockResolvedValue([]);

  const wrapper = mount(RequirementList, {
    global: {
      plugins: [pinia],
      stubs: componentStubs()
    }
  });
  await flushPromises();
  return wrapper;
}

describe('RequirementList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('编辑已有需求时允许修改标题和分支名并保留需求号锁定', async () => {
    const current = workflow();
    const wrapper = await mountList(current);

    (wrapper.vm as any).openEditDialog(current);
    await flushPromises();

    const inputs = wrapper.findAll('input');
    const requirementIdInputIndex = inputs.findIndex((input) => input.attributes('disabled') !== undefined);
    const requirementIdInput = inputs[requirementIdInputIndex];
    const titleInput = inputs[requirementIdInputIndex + 1];
    const branchInput = inputs[requirementIdInputIndex + 2];
    expect(wrapper.text()).toContain('编辑需求');
    expect(requirementIdInput.attributes('disabled')).toBeDefined();
    expect(titleInput.attributes('disabled')).toBeUndefined();
    expect(branchInput.attributes('disabled')).toBeUndefined();

    await titleInput.setValue('新标题');
    await branchInput.setValue('feature/opp-172014-edit');
    (wrapper.vm as any).selectedProjectPaths = ['opp-api', 'opp-diy'];
    await (wrapper.vm as any).submit();

    expect(apiClient.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: '172014',
        title: '新标题',
        branchName: 'feature/opp-172014-edit',
        projects: [
          { name: 'opp-api', path: 'opp-api' },
          { name: 'opp-diy', path: 'opp-diy' }
        ]
      })
    );
    expect(routerPush).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('需求信息已保存');
  });

  it('列表展示工程名、阶段颜色类和最近运行中文描述', async () => {
    const current = {
      ...workflow(),
      currentStage: 'CODE_REVIEW' as const,
      projects: [
        {
          name: 'opp-learn',
          path: '/Users/key.lin/work/Projects/opp/opp-learn'
        },
        {
          name: '/Users/key.lin/work/Projects/opp/opp-api',
          path: '/Users/key.lin/work/Projects/opp/opp-api'
        }
      ],
      runs: [
        {
          id: 'run-1',
          requirementId: '172014',
          actionType: 'CODE_REVIEW' as const,
          status: 'SUCCEEDED' as const,
          startedAt: '2026-06-03T08:00:00.000Z',
          params: {}
        }
      ]
    };
    const wrapper = await mountList(current);
    const vm = wrapper.vm as unknown as {
      projectDisplayName: (project: { name: string; path: string }) => string;
      stageTagClass: (stage: 'CODE_REVIEW') => string[];
      recentRunText: (run?: (typeof current.runs)[number]) => string;
      stageText: (stage: string) => string;
    };

    expect(vm.projectDisplayName(current.projects[0])).toBe('opp-learn');
    expect(vm.projectDisplayName(current.projects[1])).toBe('opp-api');
    expect(vm.stageTagClass('CODE_REVIEW')).toEqual(['stage-tag', 'stage-tag--CODE_REVIEW']);
    expect(vm.stageText('TECH_DESIGN')).toBe('技术方案');
    expect(vm.stageText('SKIPPED')).toBe('已跳过');
    expect(vm.recentRunText(current.runs[0])).toBe('代码评审（成功）');
    expect(vm.recentRunText()).toBe('暂无');
  });

  it('展示需求累计 token 和最近一次 token 用量', async () => {
    const current = {
      ...workflow(),
      id: 100
    };
    const wrapper = await mountList(current);
    const projectStore = useProjectStore();
    projectStore.current = {
      id: 10,
      name: 'AI Delivery',
      code: 'AI',
      status: 'ACTIVE',
      role: 'OWNER'
    };
    vi.mocked(apiClient.listProjectTokenUsageSummaries).mockResolvedValue([
      {
        requirementPk: 100,
        summary: {
          totalTokens: 61129,
          inputTokens: 60835,
          cachedInputTokens: 32512,
          outputTokens: 294,
          reasoningOutputTokens: 171,
          runCount: 1,
          detailCount: 1
        },
        latestRunSummary: {
          runId: 700,
          totalTokens: 61129,
          inputTokens: 60835,
          cachedInputTokens: 32512,
          outputTokens: 294,
          reasoningOutputTokens: 171,
          runCount: 1,
          detailCount: 1
        },
        stageSummaries: [],
        agentSummaries: []
      }
    ]);

    await (wrapper.vm as any).loadTokenUsageSummaries();

    expect((wrapper.vm as any).tokenUsageFor(current).summary.totalTokens).toBe(61129);
    expect((wrapper.vm as any).formatTokenCount(61129)).toBe('61.1K');
  });

  it('支持打开 AI 完整度弹窗维护 commit 并计算当前需求', async () => {
    const current = workflow();
    const wrapper = await mountList(current);

    await (wrapper.vm as any).openAiCompletenessDialog(current);
    await flushPromises();

    expect(apiClient.getAiCodeCompleteness).toHaveBeenCalledWith('172014');
    expect((wrapper.vm as any).aiCompletenessProjects[0].projectPath).toBe('opp-api');
    (wrapper.vm as any).aiCompletenessProjects[0].baseCommit = 'base';
    (wrapper.vm as any).aiCompletenessProjects[0].aiCommit = 'ai';

    await (wrapper.vm as any).calculateAiCompleteness();
    await flushPromises();

    expect(apiClient.calculateAiCodeCompleteness).toHaveBeenCalledWith('172014', {
      projects: [
        {
          projectPath: 'opp-api',
          projectName: 'opp-api',
          baseCommit: 'base',
          aiCommit: 'ai'
        }
      ]
    });
    expect((wrapper.vm as any).aiCompletenessText((wrapper.vm as any).store.requirements[0])).toBe('83.3%');
  });

  it('支持按标题或需求号、需求类型、阶段和涉及工程过滤并清空', async () => {
    const current = workflow();
    current.title = '新增定位菜单组件';
    const defectDone: RequirementWorkflow = {
      ...workflow(),
      requirementId: '173229',
      title: '邀请好友积分异常',
      requirementType: 'DEFECT',
      branchName: 'bugfix/opp#173229',
      currentStage: 'DONE',
      projects: [{ name: 'opp-learn', path: 'opp-learn' }]
    };
    const defectDesign: RequirementWorkflow = {
      ...workflow(),
      requirementId: '170025',
      title: '保存卷王测评记录异常修复',
      requirementType: 'DEFECT',
      branchName: 'bugfix/opp#170025',
      currentStage: 'TECH_DESIGN',
      projects: [{ name: 'opp-diy', path: 'opp-diy' }]
    };
    const wrapper = await mountList([current, defectDone, defectDesign]);
    const vm = wrapper.vm as unknown as {
      filters: {
        keyword: string;
        requirementType: 'REQUIREMENT' | 'DEFECT' | '';
        stage: RequirementWorkflow['currentStage'] | '';
        projectPaths: string[];
      };
      filteredRequirements: RequirementWorkflow[];
      filterSummaryText: string;
      stageFilterOptions: Array<{ label: string; value: string }>;
      projectFilterOptions: Array<{ label: string; value: string }>;
      clearFilters: () => void;
    };

    vm.filters.keyword = '积分';
    await flushPromises();
    expect(vm.filteredRequirements.map((item) => item.requirementId)).toEqual(['173229']);

    vm.filters.keyword = '170025';
    await flushPromises();
    expect(vm.filteredRequirements.map((item) => item.requirementId)).toEqual(['170025']);

    vm.filters.keyword = '';
    vm.filters.requirementType = 'DEFECT';
    vm.filters.stage = 'TECH_DESIGN';
    vm.filters.projectPaths = ['opp-diy'];
    await flushPromises();

    expect(vm.filteredRequirements.map((item) => item.requirementId)).toEqual(['170025']);
    expect(vm.filterSummaryText).toBe('已筛选 1 / 共 3 条');
    expect(vm.stageFilterOptions).toContainEqual({ label: '完成', value: 'DONE' });
    expect(vm.projectFilterOptions).toContainEqual({ label: 'opp-diy', value: 'opp-diy' });

    vm.clearFilters();
    await flushPromises();

    expect(vm.filteredRequirements.map((item) => item.requirementId)).toEqual(['172014', '173229', '170025']);
    expect(vm.filterSummaryText).toBe('共 3 条');
  });

  it('支持在筛选结果后分页、切换页大小并保持页码有效', async () => {
    const workflows = Array.from({ length: 12 }, (_, index) => ({
      ...workflow(),
      requirementId: `${170000 + index}`,
      title: `需求 ${index + 1}`,
      branchName: `feature/opp-${170000 + index}`
    }));
    const wrapper = await mountList(workflows);
    const vm = wrapper.vm as unknown as {
      filters: {
        keyword: string;
        requirementType: 'REQUIREMENT' | 'DEFECT' | '';
        stage: RequirementWorkflow['currentStage'] | '';
        projectPaths: string[];
      };
      currentPage: number;
      pageSize: number;
      pageCount: number;
      pagedRequirements: RequirementWorkflow[];
      clampCurrentPage: () => void;
    };

    expect(vm.pagedRequirements.map((item) => item.requirementId)).toEqual(workflows.slice(0, 10).map((item) => item.requirementId));

    vm.currentPage = 2;
    await flushPromises();
    expect(vm.pagedRequirements.map((item) => item.requirementId)).toEqual(workflows.slice(10).map((item) => item.requirementId));

    vm.pageSize = 20;
    await flushPromises();
    expect(vm.currentPage).toBe(1);
    expect(vm.pagedRequirements.map((item) => item.requirementId)).toEqual(workflows.map((item) => item.requirementId));

    vm.currentPage = 2;
    vm.filters.keyword = '需求 12';
    await flushPromises();
    expect(vm.currentPage).toBe(1);
    expect(vm.pagedRequirements.map((item) => item.requirementId)).toEqual(['170011']);

    vm.currentPage = 99;
    vm.clampCurrentPage();
    await flushPromises();
    expect(vm.currentPage).toBe(vm.pageCount);
  });
});
