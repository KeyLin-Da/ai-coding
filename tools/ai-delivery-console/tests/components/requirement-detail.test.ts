import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProvider, ArtifactRef, OpenSpecSummary, RequirementWorkflow } from '../../shared/workflow';
import { createEmptyImplementationSteps, createEmptyStages } from '../../shared/workflow';
import RequirementDetail from '../../src/views/RequirementDetail.vue';
import { apiClient } from '@/api/client';
import { ElMessage } from 'element-plus';

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: {
      requirementId: '172014'
    }
  })
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    listAgents: vi.fn(),
    listRequirements: vi.fn(),
    getRequirement: vi.fn(),
    getOpenSpecSummary: vi.fn(),
    runAction: vi.fn(),
    previewActionCommand: vi.fn()
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

const agents: AgentProvider[] = [
  {
    id: 'codex',
    name: 'Codex',
    inputMode: 'PROMPT_FILE',
    available: true,
    supportsStreaming: false
  }
];

const emptyOpenSpecSummary: OpenSpecSummary = {
  changeName: 'req-172014',
  rootPath: '',
  exists: false,
  archived: false,
  artifacts: [],
  specs: [],
  tasks: {
    total: 0,
    completed: 0,
    groups: []
  }
};

function artifact(stage: ArtifactRef['stage'], path: string): ArtifactRef {
  return {
    id: `${stage}-${path}`,
    stage,
    label: path,
    path,
    kind: 'markdown',
    exists: true
  };
}

function workflow(artifacts: ArtifactRef[], startChangeApproved = true): RequirementWorkflow {
  const now = new Date().toISOString();
  const stages = createEmptyStages();
  const implementationSteps = createEmptyImplementationSteps();
  stages.PRD.status = 'APPROVED';
  stages.TECH_DESIGN.status = 'APPROVED';
  if (startChangeApproved) {
    implementationSteps.START_CHANGE.status = 'APPROVED';
    implementationSteps.ARTIFACT_REVIEW.status = 'DRAFT';
  }
  return {
    requirementId: '172014',
    title: '定位菜单',
    branchName: 'feature/opp-172014',
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages,
    implementationSteps,
    artifacts,
    runs: [],
    reviews: [],
    issues: []
  };
}

function componentStubs() {
  return {
    StageTimeline: { template: '<div />' },
    MarkdownEditor: { template: '<div />' },
    OpenSpecDocuments: { template: '<div />' },
    ReviewDialog: { template: '<div />' },
    RunLogDrawer: { template: '<div />' },
    ArtifactSidebar: { template: '<div />' },
    ArtifactPreviewDialog: { template: '<div />' },
    GitChangeInspector: { template: '<div />' },
    ElAlert: {
      props: ['title'],
      template: '<div>{{ title }}</div>'
    },
    ElButton: {
      props: ['disabled'],
      template: '<button :disabled="disabled"><slot /></button>'
    },
    ElCheckbox: { template: '<input type="checkbox" />' },
    ElDescriptions: { template: '<div><slot /></div>' },
    ElDescriptionsItem: { template: '<div><slot /></div>' },
    ElEmpty: { template: '<div><slot /></div>' },
    ElInput: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    },
    ElOption: {
      props: ['label', 'value'],
      template: '<option :value="value">{{ label }}<slot /></option>'
    },
    ElProgress: { template: '<div />' },
    ElSelect: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
    },
    ElTag: { template: '<span><slot /></span>' }
  };
}

async function mountDetail(current: RequirementWorkflow) {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.mocked(apiClient.getRequirement).mockResolvedValue(current);
  vi.mocked(apiClient.listAgents).mockResolvedValue(agents);
  vi.mocked(apiClient.listRequirements).mockResolvedValue([current]);
  vi.mocked(apiClient.getOpenSpecSummary).mockResolvedValue(emptyOpenSpecSummary);
  vi.mocked(apiClient.runAction).mockResolvedValue({ workflow: current });

  const wrapper = mount(RequirementDetail, {
    global: {
      plugins: [pinia],
      mocks: {
        $router: {
          push: vi.fn()
        }
      },
      stubs: componentStubs()
    }
  });
  await flushPromises();
  return wrapper;
}

function openSpecArtifactButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('生成 OpenSpec 工件'));
  if (!button) {
    throw new Error('未找到生成 OpenSpec 工件按钮');
  }
  return button;
}

async function activateImplementationStep(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text().includes(label));
  if (!button) {
    throw new Error(`未找到实施验证子步骤：${label}`);
  }
  await button.trigger('click');
}

function openSpecStartButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => ['开始变更', '复制开始变更命令'].includes(item.text().trim()));
  if (!button) {
    throw new Error('未找到开始变更按钮');
  }
  return button;
}

describe('RequirementDetail OpenSpec 工件生成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      configurable: true
    });
  });

  it('缺少 PRD 文档路径时不发起工件生成并提示', async () => {
    const current = workflow([artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')]);
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');

    expect(ElMessage.warning).toHaveBeenCalledWith('请先生成、保存或刷新 PRD 产物');
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(apiClient.previewActionCommand).not.toHaveBeenCalled();
  });

  it('缺少技术方案文档路径时不发起工件生成并提示', async () => {
    const current = workflow([artifact('PRD', 'docs/172014/prd/analysis.md')]);
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');

    expect(ElMessage.warning).toHaveBeenCalledWith('请先生成、保存或刷新技术方案产物');
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(apiClient.previewActionCommand).not.toHaveBeenCalled();
  });

  it('手动复制复用双文档参数且不创建运行记录', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    vi.mocked(apiClient.previewActionCommand).mockResolvedValue({
      commandText: '/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md'
    });
    const wrapper = await mountDetail(current);

    await wrapper.findAll('select')[1].setValue('MANUAL_COPY');
    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.previewActionCommand).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          documentPath: 'docs/172014/technical-design/design_review.md'
        })
      })
    );
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('命令已复制');
  });

  it('开始变更动作发起 OPENSPEC_NEW_CHANGE', async () => {
    const current = workflow([]);
    const wrapper = await mountDetail(current);

    await openSpecStartButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_NEW_CHANGE',
        params: expect.objectContaining({
          changeName: 'req-172014'
        })
      })
    );
  });

  it('手动复制开始变更命令且不创建运行记录', async () => {
    const current = workflow([]);
    vi.mocked(apiClient.previewActionCommand).mockResolvedValue({
      commandText: 'openspec new change req-172014'
    });
    const wrapper = await mountDetail(current);

    await wrapper.findAll('select')[1].setValue('MANUAL_COPY');
    await openSpecStartButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.previewActionCommand).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_NEW_CHANGE',
        params: expect.objectContaining({
          changeName: 'req-172014'
        })
      })
    );
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('命令已复制');
  });

  it('开始变更未审核通过时阻止生成 OpenSpec 工件', async () => {
    const current = workflow(
      [artifact('PRD', 'docs/172014/prd/analysis.md'), artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')],
      false
    );
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');

    expect(wrapper.text()).toContain('请先完成并审核开始变更步骤');
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(apiClient.previewActionCommand).not.toHaveBeenCalled();
  });
});
