import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProvider, ArtifactRef, OpenSpecSummary, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyImplementationSteps, createEmptyStages } from '../../shared/workflow';
import RequirementDetail from '../../src/views/RequirementDetail.vue';
import { apiClient } from '@/api/client';
import { setApiRuntimeConfig } from '@/api/runtime';
import { ElMessage, ElMessageBox } from 'element-plus';

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
    getGitChanges: vi.fn(),
    getRunEvents: vi.fn(),
    openRunEventStream: vi.fn(),
    previewActionCommand: vi.fn(),
    readArtifact: vi.fn(),
    deleteTechDesignQuestion: vi.fn(),
    uploadTechDesignFiles: vi.fn(),
    uploadPrdFiles: vi.fn(),
    deleteTechDesignFile: vi.fn(),
    deletePrdFile: vi.fn(),
    getDeliveryWorkspace: vi.fn(),
    listGitCredentials: vi.fn(),
    getProjectRepositoryStatus: vi.fn(),
    refreshProjectRepositoryStatus: vi.fn(),
    assertRequirementWritable: vi.fn(),
    listRequirementWorkspaceStates: vi.fn()
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
    },
    ElMessageBox: {
      confirm: vi.fn()
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

let eventSourceUrls: string[] = [];

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly url: string) {
    eventSourceUrls.push(url);
  }

  close() {
    return undefined;
  }
}

function artifact(stage: ArtifactRef['stage'], path: string, overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: `${stage}-${path}`,
    stage,
    label: path,
    path,
    kind: 'markdown',
    exists: true,
    ...overrides
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

function defectWorkflow(artifacts: ArtifactRef[], currentStage: RequirementWorkflow['currentStage'] = 'TECH_DESIGN'): RequirementWorkflow {
  const item = workflow(artifacts);
  item.title = '邀请好友积分异常';
  item.requirementType = 'DEFECT';
  item.branchName = 'bugfix/opp#172014';
  item.currentStage = currentStage;
  item.stages = createEmptyStages('DEFECT');
  item.stages.TECH_DESIGN.status = currentStage === 'TECH_DESIGN' ? 'DRAFT' : 'APPROVED';
  return item;
}

function techDesignWorkflow(artifacts: ArtifactRef[]): RequirementWorkflow {
  const item = workflow(artifacts);
  item.currentStage = 'TECH_DESIGN';
  item.stages.TECH_DESIGN.status = 'DRAFT';
  return item;
}

function componentStubs() {
  return {
    StageTimeline: { template: '<div />' },
    MarkdownEditor: {
      props: ['title', 'artifactPath'],
      template: '<div class="markdown-editor">{{ title }} {{ artifactPath }}</div>'
    },
    OpenSpecDocuments: { template: '<div />' },
    ReviewDialog: { template: '<div />' },
    RunLogDrawer: { template: '<div />' },
    ArtifactSidebar: { template: '<div />' },
    ArtifactPreviewDialog: { template: '<div />' },
    GitChangeInspector: {
      props: ['summary', 'requirementId'],
      emits: ['updated'],
      template:
        '<div class="git-inspector-stub"><span class="git-summary-updated-at">{{ summary?.updatedAt }}</span><span class="git-requirement-id">{{ requirementId }}</span><button class="git-inspector-emit" @click="$emit(\'updated\', { updatedAt: \'after-stage\', files: [{ path: \'opp-learn/src/new.ts\', status: \'A\', staged: true, unstaged: false }], untrackedFiles: [], diff: \'\', projects: [], additions: 0, deletions: 0 })">emit</button></div>'
    },
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
    ElDialog: {
      props: ['modelValue', 'title'],
      emits: ['update:modelValue'],
      template: '<div v-if="modelValue" class="dialog-stub"><h3>{{ title }}</h3><slot /><slot name="footer" /></div>'
    },
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
    ElRadioGroup: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template:
        '<div><button class="review-mode-commit" @click="$emit(\'update:modelValue\', \'commit\')">正式评审</button><button class="review-mode-staged" @click="$emit(\'update:modelValue\', \'staged\')">暂存区预审</button><slot /></div>'
    },
    ElRadioButton: {
      props: ['label'],
      template: '<span><slot /></span>'
    },
    ElSelect: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
    },
    ElTag: { template: '<span><slot /></span>' }
  };
}

async function mountDetail(current: RequirementWorkflow, openSpecSummary: OpenSpecSummary = emptyOpenSpecSummary) {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.mocked(apiClient.getRequirement).mockResolvedValue(current);
  vi.mocked(apiClient.listAgents).mockResolvedValue(agents);
  vi.mocked(apiClient.listRequirements).mockResolvedValue([current]);
  vi.mocked(apiClient.getOpenSpecSummary).mockResolvedValue(openSpecSummary);
  vi.mocked(apiClient.getGitChanges).mockResolvedValue({
    updatedAt: new Date().toISOString(),
    files: [],
    untrackedFiles: [],
    diff: '',
    projects: [],
    additions: 0,
    deletions: 0
  });
  vi.mocked(apiClient.getRunEvents).mockResolvedValue([]);
  const run: RunRecord = {
    id: 'run-auto-log',
    requirementId: current.requirementId,
    actionType: 'OPENSPEC_NEW_CHANGE',
    stage: 'IMPLEMENTATION',
    implementationStep: 'START_CHANGE',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    params: {}
  };
  vi.mocked(apiClient.runAction).mockResolvedValue({ run, workflow: current });
  vi.mocked(apiClient.deleteTechDesignQuestion).mockResolvedValue(current);
  vi.mocked(apiClient.uploadTechDesignFiles).mockResolvedValue(current);
  vi.mocked(apiClient.uploadPrdFiles).mockResolvedValue(current);
  vi.mocked(apiClient.deleteTechDesignFile).mockResolvedValue(current);
  vi.mocked(apiClient.deletePrdFile).mockResolvedValue(current);
  vi.mocked(apiClient.assertRequirementWritable).mockResolvedValue([]);
  vi.mocked(apiClient.listRequirementWorkspaceStates).mockResolvedValue([]);

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

function codeReviewButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('生成代码评审'));
  if (!button) {
    throw new Error('未找到生成代码评审按钮');
  }
  return button;
}

function designButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('生成技术方案'));
  if (!button) {
    throw new Error('未找到生成技术方案按钮');
  }
  return button;
}

function designQuestionEntryButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('技术方案答疑'));
  if (!button) {
    throw new Error('未找到技术方案答疑按钮');
  }
  return button;
}

function designQuestionSubmitButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('提问'));
  if (!button) {
    throw new Error('未找到技术方案提问按钮');
  }
  return button;
}

function prdClarificationButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('澄清 PRD'));
  if (!button) {
    throw new Error('未找到澄清 PRD 按钮');
  }
  return button;
}

function prdWorkflow(artifacts: ArtifactRef[], status: RequirementWorkflow['stages']['PRD']['status'] = 'DRAFT'): RequirementWorkflow {
  const current = workflow(artifacts);
  current.currentStage = 'PRD';
  current.status = 'DRAFT';
  current.stages.PRD.status = status;
  return current;
}

async function openDesignQuestionDialog(wrapper: ReturnType<typeof mount>) {
  await designQuestionEntryButton(wrapper).trigger('click');
  await flushPromises();
}

describe('RequirementDetail OpenSpec 工件生成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventSourceUrls = [];
    setApiRuntimeConfig({
      centerBaseUrl: 'http://127.0.0.1:8728',
      runnerBaseUrl: 'http://127.0.0.1:8718',
      userId: '1',
      projectId: '10',
      clientSessionId: '20'
    });
    vi.mocked(ElMessageBox.confirm).mockResolvedValue(undefined as never);
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {},
      content: ''
    });
    vi.mocked(apiClient.getDeliveryWorkspace).mockResolvedValue({
      id: 1,
      clientSessionId: 20,
      localPath: '/tmp/ai-delivery',
      status: 'ACTIVE'
    });
    vi.mocked(apiClient.listGitCredentials).mockResolvedValue([
      {
        id: 1,
        platform: 'PROJECT_GIT',
        fingerprint: 'SHA256:test',
        publicKey: 'ssh-ed25519 AAAA',
        status: 'ACTIVE'
      }
    ]);
    vi.mocked(apiClient.getProjectRepositoryStatus).mockResolvedValue({
      projectId: 10,
      clientSessionId: 20,
      localRepoPath: '/tmp/ai-delivery/project',
      syncStatus: 'READY'
    });
    vi.mocked(apiClient.refreshProjectRepositoryStatus).mockResolvedValue({
      projectId: 10,
      clientSessionId: 20,
      localRepoPath: '/tmp/ai-delivery/project',
      syncStatus: 'READY'
    });
    vi.mocked(apiClient.openRunEventStream).mockImplementation((requirementId: string, runId: string) => new MockEventSource(`runner:${requirementId}:${runId}`) as unknown as EventSource);
    vi.stubGlobal('EventSource', MockEventSource);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      configurable: true
    });
  });

  it('缺陷详情默认进入技术方案且不展示 PRD 阻断信息', async () => {
    const current = defectWorkflow([]);
    const wrapper = await mountDetail(current);

    expect(wrapper.text()).toContain('技术方案');
    expect(wrapper.text()).not.toContain('需要先通过 PRD 审核');
    expect(wrapper.text()).not.toContain('PRD 文档');
    expect(wrapper.text()).not.toContain('生成 PRD');
    expect(wrapper.text()).not.toContain('澄清 PRD');
    expect(designButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('未生成 PRD 时禁用澄清入口并提示先生成文档', async () => {
    const wrapper = await mountDetail(prdWorkflow([]));

    expect(prdClarificationButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('请先生成 PRD 文档后再澄清');
  });

  it('已有 PRD 时通过弹窗提交 PRD 澄清且不携带 sources', async () => {
    const current = prdWorkflow([artifact('PRD', 'docs/172014/prd/analysis.md')]);
    const wrapper = await mountDetail(current);

    await prdClarificationButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('docs/172014/prd/analysis.md');

    await wrapper.find('.prd-clarification-input').setValue('补充异常场景');
    const submitButton = wrapper.findAll('button').find((item) => item.text().includes('提交澄清'));
    await submitButton?.trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).not.toHaveBeenCalled();
    expect(apiClient.runAction).toHaveBeenCalledWith('172014', {
      actionType: 'PRD_CLARIFY',
      params: {
        agentId: 'codex',
        executionMode: 'BACKGROUND',
        description: '补充异常场景'
      }
    });
    expect(vi.mocked(apiClient.runAction).mock.calls[0][1].params).not.toHaveProperty('sources');
  });

  it('已审核 PRD 提交澄清前需要确认重新审核', async () => {
    const current = prdWorkflow([artifact('PRD', 'docs/172014/prd/analysis.md')], 'APPROVED');
    const wrapper = await mountDetail(current);

    await prdClarificationButton(wrapper).trigger('click');
    await flushPromises();
    await wrapper.find('.prd-clarification-input').setValue('补充范围边界');
    const submitButton = wrapper.findAll('button').find((item) => item.text().includes('提交澄清'));
    await submitButton?.trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('回到待审核状态'), '确认澄清 PRD', expect.any(Object));
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'PRD_CLARIFY'
      })
    );
  });

  it('技术方案输入区集中展示补充材料、补充说明和生成动作', async () => {
    const current = defectWorkflow([]);
    const wrapper = await mountDetail(current);

    const inputPanel = wrapper.find('.design-input-panel');

    expect(inputPanel.exists()).toBe(true);
    expect(inputPanel.text()).toContain('补充材料');
    expect(inputPanel.text()).toContain('补充说明');
    expect(inputPanel.text()).toContain('技术方案答疑');
    expect(inputPanel.text()).toContain('生成技术方案');
    expect(inputPanel.find('.design-run-footer').exists()).toBe(true);
    expect(inputPanel.find('.design-clarification').attributes('rows')).toBe('4');
  });

  it('上传技术方案补充材料不刷新项目仓库状态', async () => {
    const current = defectWorkflow([]);
    current.id = 172014;
    vi.mocked(apiClient.uploadTechDesignFiles).mockResolvedValue({
      ...current,
      techDesignSourceFiles: [
        {
          id: 'file-1',
          name: '补充说明.md',
          path: 'docs/172014/technical-design/file/file-1.md',
          size: 8,
          mimeType: 'text/markdown',
          uploadedAt: new Date().toISOString()
        }
      ]
    });
    const wrapper = await mountDetail(current);
    vi.mocked(apiClient.listGitCredentials).mockClear();
    vi.mocked(apiClient.refreshProjectRepositoryStatus).mockClear();
    vi.mocked(apiClient.assertRequirementWritable).mockClear();

    const input = wrapper.find<HTMLInputElement>('input.hidden-file-input');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['# design'], '补充说明.md', { type: 'text/markdown' })],
      configurable: true
    });
    await input.trigger('change');
    await flushPromises();

    expect(apiClient.uploadTechDesignFiles).toHaveBeenCalledWith('172014', expect.any(Array));
    expect(apiClient.assertRequirementWritable).toHaveBeenCalledWith(172014, '20');
    expect(apiClient.listGitCredentials).not.toHaveBeenCalled();
    expect(apiClient.refreshProjectRepositoryStatus).not.toHaveBeenCalled();
  });

  it('缺陷生成技术方案时不传 PRD documentPath', async () => {
    const current = defectWorkflow([]);
    const wrapper = await mountDetail(current);

    await designButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_GENERATE',
        params: expect.not.objectContaining({
          documentPath: expect.any(String)
        })
      })
    );
    expect(ElMessage.warning).not.toHaveBeenCalledWith('请先通过 PRD 审核');
  });

  it('当前用户项目仓 DIRTY 时仍允许继续执行自己的工作流动作', async () => {
    vi.mocked(apiClient.refreshProjectRepositoryStatus).mockResolvedValue({
      projectId: 10,
      clientSessionId: 20,
      localRepoPath: '/tmp/ai-delivery/project',
      syncStatus: 'DIRTY'
    });
    const current = defectWorkflow([]);
    const wrapper = await mountDetail(current);

    await designButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_GENERATE'
      })
    );
    expect(ElMessage.warning).not.toHaveBeenCalledWith('项目产物仓存在未同步变更，请先公开同步或清理后再继续流程动作');
  });

  it('技术方案编辑器在仅有补充材料时指向正式设计文档默认路径', async () => {
    const current = defectWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/file/screenshot.png', {
        id: 'technical-design-source-1',
        kind: 'text'
      })
    ]);
    const wrapper = await mountDetail(current);

    const editor = wrapper.findAll('.markdown-editor').find((item) => item.text().includes('技术方案'));

    expect(editor?.text()).toContain('docs/172014/technical-design/design_review.md');
    expect(editor?.text()).not.toContain('docs/172014/technical-design/file/screenshot.png');
  });

  it('技术方案编辑器在正式文档存在时渲染正式文档', async () => {
    const current = defectWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    const wrapper = await mountDetail(current);

    const editor = wrapper.findAll('.markdown-editor').find((item) => item.text().includes('技术方案'));

    expect(editor?.text()).toContain('docs/172014/technical-design/design_review.md');
  });

  it('技术方案正式文档和补充材料共存时编辑器仍渲染正式文档且材料列表可见', async () => {
    const current = defectWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/file/screenshot.png', {
        id: 'technical-design-source-1',
        kind: 'text'
      }),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    current.techDesignSourceFiles = [
      {
        id: 'file-1',
        name: 'screenshot.png',
        path: 'docs/172014/technical-design/file/screenshot.png',
        size: 241000,
        uploadedAt: new Date().toISOString()
      }
    ];
    const wrapper = await mountDetail(current);

    const editor = wrapper.findAll('.markdown-editor').find((item) => item.text().includes('技术方案'));

    expect(editor?.text()).toContain('docs/172014/technical-design/design_review.md');
    expect(editor?.text()).not.toContain('docs/172014/technical-design/file/screenshot.png');
    expect(wrapper.text()).toContain('screenshot.png');
  });

  it('普通需求发起技术方案答疑时传入 PRD 和正式方案，并由后端生成输出路径', async () => {
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    const wrapper = await mountDetail(current);

    await openDesignQuestionDialog(wrapper);
    await wrapper.find('.design-question-dialog-input').setValue('为什么需要缓存');
    await designQuestionSubmitButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_QUESTION',
        params: expect.objectContaining({
          question: '为什么需要缓存',
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          designDocumentPath: 'docs/172014/technical-design/design_review.md'
        })
      })
    );
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        params: expect.not.objectContaining({
          outputPath: expect.any(String)
        })
      })
    );
  });

  it('技术方案答疑缺少正式方案时提示并阻止动作', async () => {
    const current = techDesignWorkflow([artifact('PRD', 'docs/172014/prd/analysis.md')]);
    const wrapper = await mountDetail(current);

    await openDesignQuestionDialog(wrapper);
    await wrapper.find('.design-question-dialog-input').setValue('为什么需要缓存');
    await designQuestionSubmitButton(wrapper).trigger('click');

    expect(ElMessage.warning).toHaveBeenCalledWith('请先生成、保存或刷新技术方案产物');
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(apiClient.previewActionCommand).not.toHaveBeenCalled();
  });

  it('普通需求技术方案答疑缺少 PRD 时提示并阻止动作', async () => {
    const current = techDesignWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    const wrapper = await mountDetail(current);

    await openDesignQuestionDialog(wrapper);
    await wrapper.find('.design-question-dialog-input').setValue('为什么需要缓存');
    await designQuestionSubmitButton(wrapper).trigger('click');

    expect(ElMessage.warning).toHaveBeenCalledWith('请先生成、保存或刷新 PRD 产物');
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(apiClient.previewActionCommand).not.toHaveBeenCalled();
  });

  it('缺陷技术方案答疑不要求 PRD 文档', async () => {
    const current = defectWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    const wrapper = await mountDetail(current);

    await openDesignQuestionDialog(wrapper);
    await wrapper.find('.design-question-dialog-input').setValue('为什么不补偿历史数据');
    await designQuestionSubmitButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_QUESTION',
        params: expect.objectContaining({
          question: '为什么不补偿历史数据',
          designDocumentPath: 'docs/172014/technical-design/design_review.md'
        })
      })
    );
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_QUESTION',
        params: expect.not.objectContaining({
          prdDocumentPath: expect.any(String)
        })
      })
    );
  });

  it('新增答疑记录存在时展示增量提示并作为技术方案生成补充项', async () => {
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      }),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/questions.md', {
        id: 'technical-design-questions'
      })
    ]);
    current.techDesignSourceFiles = [
      {
        id: 'file-1',
        name: 'old-design.md',
        path: 'docs/172014/technical-design/file/old-design.md',
        size: 100,
        uploadedAt: new Date().toISOString()
      }
    ];
    const wrapper = await mountDetail(current);

    expect(wrapper.text()).toContain('新增答疑');
    expect(wrapper.text()).toContain('将纳入下一次生成');
    await designButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_GENERATE',
        params: expect.objectContaining({
          sourceFiles: ['docs/172014/technical-design/questions.md', 'docs/172014/technical-design/file/old-design.md']
        })
      })
    );
  });

  it('已消费答疑记录不在技术方案生成输入区展示和提交', async () => {
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      }),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/questions/20260604-173000-question.md', {
        id: 'technical-design-question-1'
      })
    ]);
    current.techDesignConsumedQuestionPaths = ['docs/172014/technical-design/questions/20260604-173000-question.md'];
    current.techDesignSourceFiles = [
      {
        id: 'file-1',
        name: 'new-design.md',
        path: 'docs/172014/technical-design/file/new-design.md',
        size: 100,
        uploadedAt: new Date().toISOString()
      }
    ];
    const wrapper = await mountDetail(current);

    expect(wrapper.find('.design-question-context').exists()).toBe(false);
    await designButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_GENERATE',
        params: expect.objectContaining({
          sourceFiles: ['docs/172014/technical-design/file/new-design.md']
        })
      })
    );
  });

  it('技术方案答疑弹框展示问题状态并支持查看答案和进度', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {},
      content: `# 技术方案答疑记录

## 2026-06-04 17:30:00 / 172014

**问题：**
为什么需要缓存？

**输入上下文：**
- 文档：docs/172014/prd/analysis.md

**回答：**
因为存在重复查询。

**依据：**
- 技术方案缓存策略

**后续建议：**
- 继续观察缓存命中率`
    });
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      }),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/questions.md', {
        id: 'technical-design-questions'
      })
    ]);
    current.runs = [
      {
        id: 'run-question-2',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'RUNNING',
        startedAt: '2026-06-04T17:45:00.000Z',
        params: {
          question: '页面导航权限如何处理？'
        }
      },
      {
        id: 'run-question-1',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: '2026-06-04T17:30:00.000Z',
        finishedAt: '2026-06-04T17:31:00.000Z',
        params: {
          question: '为什么需要缓存？'
        }
      }
    ];
    const wrapper = await mountDetail(current);
    await flushPromises();

    expect(designQuestionEntryButton(wrapper).text()).toContain('技术方案答疑 2');

    await openDesignQuestionDialog(wrapper);

    expect(wrapper.text()).toContain('为什么需要缓存？');
    expect(wrapper.text()).toContain('页面导航权限如何处理？');
    expect(wrapper.text()).toContain('已回答');
    expect(wrapper.text()).toContain('回答中');

    const answerButton = wrapper.findAll('button').find((item) => item.text().includes('查看答案'));
    await answerButton?.trigger('click');

    expect(wrapper.text()).toContain('因为存在重复查询。');
    expect(wrapper.text()).toContain('技术方案缓存策略');
    expect(wrapper.text()).toContain('继续观察缓存命中率');

    const collapseButton = wrapper.findAll('button').find((item) => item.text().includes('收起答案'));
    await collapseButton?.trigger('click');

    expect(wrapper.text()).not.toContain('因为存在重复查询。');

    const progressButton = wrapper.findAll('button').find((item) => item.text().includes('查看进度'));
    await progressButton?.trigger('click');
    await flushPromises();

    expect(apiClient.getRunEvents).toHaveBeenCalledWith('172014', 'run-question-2');
  });

  it('答疑产物索引滞后时通过运行输出路径读取答案', async () => {
    const outputPath = 'docs/172014/technical-design/questions/20260612-101549-729-1-2.md';
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {},
      content: `# 技术方案答疑记录

## 2026-06-12 10:21:27 / 172014

**问题：**
地区筛选列表接口和时间没有联动关系

**回答：**
地区筛选列表需要按周期读取快照。

**依据：**
- 技术方案 dimensions 接口

**后续建议：**
- 补充历史快照来源`
    });
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    current.runs = [
      {
        id: 'run-question-output-path',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: '2026-06-12T02:15:49.731Z',
        finishedAt: '2026-06-12T02:22:48.670Z',
        params: {
          question: '地区筛选列表接口和时间没有联动关系',
          outputPath
        }
      }
    ];
    const wrapper = await mountDetail(current);
    await flushPromises();

    expect(apiClient.readArtifact).toHaveBeenCalledWith(outputPath);
    await openDesignQuestionDialog(wrapper);

    expect(wrapper.text()).toContain('已回答');
    expect(wrapper.text()).not.toContain('待记录');

    const answerButton = wrapper.findAll('button').find((item) => item.text().includes('查看答案'));
    await answerButton?.trigger('click');

    expect(wrapper.text()).toContain('地区筛选列表需要按周期读取快照。');
    expect(wrapper.text()).toContain('技术方案 dimensions 接口');
    expect(wrapper.text()).toContain('补充历史快照来源');
  });

  it('技术方案答疑删除前二次确认，确认后删除问题并刷新记录', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {},
      content: `# 技术方案答疑记录

## 2026-06-04 17:30:00 / 172014

**问题：**
为什么需要缓存？

**回答：**
因为存在重复查询。`
    });
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      }),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/questions/20260604-173000-question.md')
    ]);
    current.runs = [
      {
        id: 'run-question-1',
        requirementId: '172014',
        actionType: 'DESIGN_QUESTION',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: '2026-06-04T17:30:00.000Z',
        params: {
          question: '为什么需要缓存？',
          outputPath: 'docs/172014/technical-design/questions/20260604-173000-question.md'
        }
      }
    ];
    const wrapper = await mountDetail(current);
    await openDesignQuestionDialog(wrapper);

    const deleteButton = wrapper.findAll('button').find((item) => item.text().includes('删除'));
    await deleteButton?.trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalled();
    expect(apiClient.deleteTechDesignQuestion).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        id: 'run-question-1',
        runId: 'run-question-1',
        sourcePath: 'docs/172014/technical-design/questions/20260604-173000-question.md',
        question: '为什么需要缓存？'
      })
    );
    expect(ElMessage.success).toHaveBeenCalledWith('技术方案答疑问题已删除');
  });

  it('手动复制技术方案答疑命令且不创建运行记录', async () => {
    const current = techDesignWorkflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    vi.mocked(apiClient.previewActionCommand).mockResolvedValue({
      commandText:
        '/coding-design-question r=172014 q=为什么需要缓存 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md o=docs/172014/technical-design/questions/20260604-173000-question.md'
    });
    const wrapper = await mountDetail(current);

    await wrapper.findAll('select')[1].setValue('MANUAL_COPY');
    await openDesignQuestionDialog(wrapper);
    await wrapper.find('.design-question-dialog-input').setValue('为什么需要缓存');
    await designQuestionSubmitButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.previewActionCommand).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_QUESTION',
        params: expect.objectContaining({
          question: '为什么需要缓存',
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          designDocumentPath: 'docs/172014/technical-design/design_review.md'
        })
      })
    );
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('命令已复制');
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

  it('缺陷生成 OpenSpec 工件时不要求也不传 PRD 文档路径', async () => {
    const current = defectWorkflow([artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')], 'IMPLEMENTATION');
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          documentPath: 'docs/172014/technical-design/design_review.md'
        })
      })
    );
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.not.objectContaining({
          prdDocumentPath: expect.any(String)
        })
      })
    );
    expect(ElMessage.warning).not.toHaveBeenCalledWith('请先生成、保存或刷新 PRD 产物');
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

  it('仅有技术方案补充材料时不把补充材料作为 OpenSpec 技术方案文档', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/file/screenshot.png', {
        id: 'technical-design-source-1',
        kind: 'text'
      })
    ]);
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
    const current = workflow([], false);
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
    expect(apiClient.getRunEvents).toHaveBeenCalledWith('172014', 'run-auto-log');
  });

  it('手动复制开始变更命令且不创建运行记录', async () => {
    const current = workflow([], false);
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

  it('已存在 OpenSpec 变更目录时禁用开始变更且不重复创建', async () => {
    const current = workflow([], false);
    const wrapper = await mountDetail(current, {
      ...emptyOpenSpecSummary,
      exists: true,
      rootPath: 'openspec/changes/req-172014'
    });

    expect(openSpecStartButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('已检测到对应 OpenSpec 变更目录，无需重复开始变更');

    await openSpecStartButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(apiClient.previewActionCommand).not.toHaveBeenCalled();
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

  it('实施验证导航不展示独立执行单测步骤，报告缺失时提示证据不足', async () => {
    const current = workflow([artifact('PRD', 'docs/172014/prd/analysis.md'), artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')]);
    const wrapper = await mountDetail(current);

    expect(wrapper.text()).not.toContain('执行单测并生成报告');
    expect(wrapper.text()).toContain('单元测试报告');
    expect(wrapper.text()).toContain('尚未扫描到单元测试报告');
    expect(wrapper.text()).toContain('docs/{需求号}/junit/**');
  });

  it('实施验证阶段展示已扫描到的单元测试报告', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md'),
      artifact('IMPLEMENTATION', 'docs/172014/junit/index.html')
    ]);
    const wrapper = await mountDetail(current);

    expect(wrapper.text()).toContain('单元测试报告');
    expect(wrapper.text()).toContain('docs/172014/junit/index.html');
    expect(wrapper.text()).toContain('查看报告');
    expect(wrapper.findAll('.markdown-editor').some((editor) => editor.text().includes('单元测试报告'))).toBe(false);
    expect(wrapper.text()).not.toContain('尚未扫描到单元测试报告');
  });

  it('代码评审默认使用 commit 正式评审模式', async () => {
    const current = workflow([]);
    current.currentStage = 'CODE_REVIEW';
    current.stages.CODE_REVIEW.status = 'DRAFT';
    const wrapper = await mountDetail(current);

    await codeReviewButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'CODE_REVIEW',
        params: expect.objectContaining({
          branchName: 'feature/opp-172014',
          reviewMode: 'commit'
        })
      })
    );
  });

  it('代码评审可切换为 staged 暂存区预审模式', async () => {
    const current = workflow([]);
    current.currentStage = 'CODE_REVIEW';
    current.stages.CODE_REVIEW.status = 'DRAFT';
    const wrapper = await mountDetail(current);
    vi.mocked(apiClient.getGitChanges).mockResolvedValue({
      updatedAt: new Date().toISOString(),
      files: [{ path: 'opp-learn/src/a.txt', status: 'M', staged: true, unstaged: false }],
      untrackedFiles: [],
      diff: 'diff --git a/src/a.txt b/src/a.txt',
      projects: [
        {
          project: { name: 'opp-learn', path: 'opp-learn' },
          branchMatches: true,
          files: [{ path: 'src/a.txt', status: 'M', staged: true, unstaged: false }],
          untrackedFiles: [],
          stagedDiff: 'diff --git a/src/a.txt b/src/a.txt',
          unstagedDiff: '',
          diff: 'diff --git a/src/a.txt b/src/a.txt',
          additions: 1,
          deletions: 0
        }
      ],
      additions: 1,
      deletions: 0
    });

    await wrapper.find('.review-mode-staged').trigger('click');
    await codeReviewButton(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('暂存区预审仅基于 git diff --cached，不作为正式合并判定');
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'CODE_REVIEW',
        params: expect.objectContaining({
          reviewMode: 'staged'
        })
      })
    );
  });

  it('staged 暂存区为空时点击代码评审直接拦截', async () => {
    const current = workflow([]);
    current.currentStage = 'CODE_REVIEW';
    current.stages.CODE_REVIEW.status = 'DRAFT';
    const wrapper = await mountDetail(current);

    await wrapper.find('.review-mode-staged').trigger('click');
    await codeReviewButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.getGitChanges).toHaveBeenCalledWith('172014');
    expect(apiClient.runAction).not.toHaveBeenCalled();
    expect(ElMessage.warning).toHaveBeenCalledWith('暂存区没有已暂存文件，请先 git add 后再执行暂存区预审');
  });

  it('查看变更组件回传 Git 摘要后同步详情页状态', async () => {
    const current = workflow([]);
    current.implementationSteps.START_CHANGE.status = 'APPROVED';
    current.implementationSteps.ARTIFACT_REVIEW.status = 'APPROVED';
    current.implementationSteps.APPLY.status = 'APPROVED';
    current.implementationSteps.CHANGE_INSPECTION.status = 'DRAFT';

    const wrapper = await mountDetail(current);
    await flushPromises();

    expect(wrapper.find('.git-requirement-id').text()).toBe('172014');
    await wrapper.find('.git-inspector-emit').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.git-summary-updated-at').text()).toBe('after-stage');
  });
});
