import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentProvider,
  ArtifactRef,
  OpenSpecSummary,
  OpenSpecVisualContextCandidate,
  RequirementWorkflow,
  RunRecord,
  TechDesignVersion
} from '../../shared/workflow';
import { createEmptyImplementationSteps, createEmptyStages } from '../../shared/workflow';
import RequirementDetail from '../../src/views/RequirementDetail.vue';
import { apiClient } from '@/api/client';
import { setApiRuntimeConfig } from '@/api/runtime';
import { useProjectStore } from '@/stores/project';
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
    listOpenSpecVisualContextCandidates: vi.fn(),
    runAction: vi.fn(),
    getGitChanges: vi.fn(),
    getRunEvents: vi.fn(),
    getRunTokenUsages: vi.fn(),
    getRequirementTokenUsageSummary: vi.fn(),
    openRunEventStream: vi.fn(),
    previewActionCommand: vi.fn(),
    previewRequirementMemoryRecall: vi.fn(),
    confirmRequirementMemoryRecall: vi.fn(),
    getRequirementRetrospective: vi.fn(),
    listMemoryCandidates: vi.fn(),
    confirmMemoryCandidate: vi.fn(),
    updateMemoryCandidate: vi.fn(),
    updateMemoryCandidateStatus: vi.fn(),
    ignoreMemoryCandidate: vi.fn(),
    readArtifact: vi.fn(),
    deleteTechDesignQuestion: vi.fn(),
    uploadTechDesignFiles: vi.fn(),
    uploadPrdFiles: vi.fn(),
    deleteTechDesignFile: vi.fn(),
    deletePrdFile: vi.fn(),
    updateSupplementInputs: vi.fn(),
    getDeliveryWorkspace: vi.fn(),
    listGitCredentials: vi.fn(),
    getProjectRepositoryStatus: vi.fn(),
    refreshProjectRepositoryStatus: vi.fn(),
    assertRequirementWritable: vi.fn(),
    listRequirementWorkspaceStates: vi.fn(),
    submitReview: vi.fn(),
    captureAiCodeCompletenessAiCommit: vi.fn(),
    listTechDesignVersions: vi.fn(),
    diffTechDesignVersions: vi.fn()
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
      confirm: vi.fn(),
      prompt: vi.fn()
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

function completeOpenSpecSummary(): OpenSpecSummary {
  return {
    ...emptyOpenSpecSummary,
    rootPath: 'openspec/changes/req-172014',
    exists: true,
    artifacts: [
      { id: 'proposal', type: 'proposal', label: 'OpenSpec Proposal', path: 'openspec/changes/req-172014/proposal.md', exists: true },
      { id: 'design', type: 'design', label: 'OpenSpec Design', path: 'openspec/changes/req-172014/design.md', exists: true },
      { id: 'tasks', type: 'tasks', label: 'OpenSpec Tasks', path: 'openspec/changes/req-172014/tasks.md', exists: true }
    ],
    specs: [
      { id: 'spec-main', type: 'spec', label: 'OpenSpec Spec', path: 'openspec/changes/req-172014/specs/main/spec.md', exists: true }
    ]
  };
}

let eventSourceUrls: string[] = [];
let reviewDialogOpen: ReturnType<typeof vi.fn>;
let artifactEditDialogOpen: ReturnType<typeof vi.fn>;

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

function techDesignVersions(overrides: Partial<TechDesignVersion>[] = []): TechDesignVersion[] {
  const base: TechDesignVersion[] = [
    {
      id: 'snapshot:base',
      source: 'DRAFT_SNAPSHOT',
      label: '评审版本',
      artifactPath: 'docs/172014/technical-design/.versions/base.md',
      readable: true,
      contentHash: 'hash-base',
      createdAt: '2026-07-13T10:00:00.000Z'
    },
    {
      id: 'current',
      source: 'CURRENT_DRAFT',
      label: '当前草稿',
      artifactPath: 'docs/172014/technical-design/design_review.md',
      readable: true,
      contentHash: 'hash-current',
      createdAt: '2026-07-14T10:00:00.000Z'
    }
  ];
  return base.map((version, index) => ({ ...version, ...(overrides[index] || {}) }));
}

function visualContextCandidate(path = 'docs/172014/prd/files/menu.png'): OpenSpecVisualContextCandidate {
  return {
    id: `PRD_FILES:${path}`,
    name: path.split('/').pop() || 'menu.png',
    path,
    source: 'PRD_FILES',
    size: 128,
    mimeType: 'image/png',
    uploadedAt: '2026-07-17T00:00:00.000Z'
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

function retrospectiveWorkflow(): RequirementWorkflow {
  const item = workflow([
    artifact('RETROSPECTIVE', 'docs/172014/retrospective/summary.md'),
    artifact('RETROSPECTIVE', 'docs/172014/retrospective/evidence.json', { kind: 'json' }),
    artifact('RETROSPECTIVE', 'docs/172014/retrospective/memory-candidates.json', { kind: 'json' }),
    artifact('RETROSPECTIVE', 'docs/172014/retrospective/recall-feedback.json', { kind: 'json' })
  ]);
  item.currentStage = 'RETROSPECTIVE';
  item.stages.IMPLEMENTATION.status = 'APPROVED';
  item.stages.CODE_REVIEW.status = 'APPROVED';
  item.stages.RETROSPECTIVE.status = 'DRAFT';
  item.stages.RETROSPECTIVE.artifactPath = 'docs/172014/retrospective/summary.md';
  return item;
}

function componentStubs() {
  return {
    StageTimeline: { template: '<div />' },
    MarkdownEditor: {
      props: ['title', 'artifactPath'],
      template: '<div class="markdown-editor">{{ title }} {{ artifactPath }}</div>'
    },
    ArtifactEditDialog: {
      template: '<div />',
      methods: {
        open(input: any) {
          artifactEditDialogOpen(input);
        }
      }
    },
    OpenSpecDocuments: { template: '<div />' },
    ReviewDialog: {
      template: '<div />',
      methods: {
        open(...args: any[]) {
          reviewDialogOpen(...args);
        }
      }
    },
    RunLogDrawer: { template: '<div />' },
    ArtifactSidebar: { template: '<div />' },
    ArtifactPreviewDialog: { template: '<div />' },
    ArtifactVersionDiffDialog: {
      template: '<div />',
      methods: {
        open: vi.fn()
      }
    },
    TechDesignVersionSelector: {
      props: ['modelValue', 'versions', 'loading', 'showCompare'],
      emits: ['update:modelValue', 'compare'],
      template:
        '<div class="tech-design-version-selector-stub"><select class="tech-design-version-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="version in versions" :key="version.id" :value="version.id">{{ version.label }}</option></select><button v-if="showCompare !== false" class="tech-design-version-compare" @click="$emit(\'compare\')">对比版本</button></div>'
    },
    MemoryRecallPreviewDialog: {
      props: ['modelValue'],
      emits: ['update:modelValue', 'confirm'],
      watch: {
        modelValue(value: boolean) {
          if (value) {
            this.$emit('update:modelValue', false);
            this.$emit('confirm', { enabled: false });
          }
        }
      },
      template: '<div />'
    },
    MemoryCandidateTable: {
      props: ['items'],
      emits: ['confirm', 'edit', 'pending', 'local', 'ignore'],
      template:
        '<div class="memory-candidate-table"><div v-for="item in items" :key="item.id" class="memory-candidate-row"><span>{{ item.statement }}</span><button class="confirm-candidate" @click="$emit(\'confirm\', item)">确认</button><button class="edit-candidate" @click="$emit(\'edit\', item)">编辑</button></div></div>'
    },
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
    ElCheckbox: {
      props: ['modelValue'],
      emits: ['change'],
      template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked)" />'
    },
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
    ElIcon: {
      template: '<span><slot /></span>'
    },
    ElOption: {
      props: ['label', 'value'],
      template: '<option :value="value">{{ label }}<slot /></option>'
    },
    ElProgress: { template: '<div />' },
    ElSkeleton: { template: '<div class="skeleton-stub" />' },
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
    ElTag: { template: '<span><slot /></span>' },
    ElTable: {
      props: ['data'],
      template: '<div class="el-table-stub"><slot /></div>'
    },
    ElTableColumn: {
      props: ['label', 'prop'],
      template: '<div class="el-table-column-stub">{{ label }}</div>'
    },
    ElPagination: { template: '<div />' },
    ElTabs: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<div><slot /></div>'
    },
    ElTabPane: { template: '<section><slot /></section>' }
  };
}

async function mountDetail(
  current: RequirementWorkflow,
  openSpecSummary: OpenSpecSummary = emptyOpenSpecSummary,
  visualContextCandidates: OpenSpecVisualContextCandidate[] = []
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useProjectStore(pinia).current = {
    id: 10,
    name: 'AI Delivery',
    code: 'ai-delivery',
    status: 'ACTIVE',
    role: 'OWNER'
  };
  vi.mocked(apiClient.getRequirement).mockResolvedValue(current);
  vi.mocked(apiClient.listAgents).mockResolvedValue(agents);
  vi.mocked(apiClient.listRequirements).mockResolvedValue([current]);
  vi.mocked(apiClient.getOpenSpecSummary).mockResolvedValue(openSpecSummary);
  vi.mocked(apiClient.listOpenSpecVisualContextCandidates).mockResolvedValue({ candidates: visualContextCandidates });
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
  vi.mocked(apiClient.getRunTokenUsages).mockResolvedValue({
    runId: 'run-auto-log',
    summary: {
      runId: 'run-auto-log',
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      runCount: 0,
      detailCount: 0
    },
    details: []
  });
  vi.mocked(apiClient.getRequirementTokenUsageSummary).mockResolvedValue({
    requirementPk: current.id,
    summary: {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      runCount: 0,
      detailCount: 0
    },
    latestRunSummary: {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      runCount: 0,
      detailCount: 0
    },
    stageSummaries: [],
    agentSummaries: []
  });
  vi.mocked(apiClient.getRequirementRetrospective).mockResolvedValue({
    evidenceCount: 0,
    candidateCount: 0,
    pendingCandidateCount: 0,
    recallFeedbackCount: 0,
    unresolvedRiskCount: 0,
    readyForReview: false
  });
  vi.mocked(apiClient.listMemoryCandidates).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 200
  });
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
  vi.mocked(apiClient.updateSupplementInputs).mockResolvedValue(current);
  vi.mocked(apiClient.assertRequirementWritable).mockResolvedValue([]);
  vi.mocked(apiClient.listRequirementWorkspaceStates).mockResolvedValue([]);
  vi.mocked(apiClient.submitReview).mockResolvedValue({
    id: 1,
    requirementPk: Number(current.id || 100),
    stage: 'IMPLEMENTATION',
    decision: 'APPROVED'
  });
  vi.mocked(apiClient.captureAiCodeCompletenessAiCommit).mockResolvedValue(current);
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
  const button = wrapper.findAll('button').find((item) => /生成 OpenSpec 工件|更新 OpenSpec 工件/.test(item.text()));
  if (!button) {
    throw new Error('未找到生成/更新 OpenSpec 工件按钮');
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

function implementationStageReviewButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().trim() === '审核实施验证');
  if (!button) {
    throw new Error('未找到审核实施验证按钮');
  }
  return button;
}

function implementationStepReviewButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().trim() === '审核本步骤');
  if (!button) {
    throw new Error('未找到审核本步骤按钮');
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

function supplementInputButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => /添加补充输入|编辑补充输入/.test(item.text()));
  if (!button) {
    throw new Error('未找到补充输入入口');
  }
  return button;
}

function supplementSaveButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('保存补充输入'));
  if (!button) {
    throw new Error('未找到保存补充输入按钮');
  }
  return button;
}

async function openSupplementInput(wrapper: ReturnType<typeof mount>) {
  await supplementInputButton(wrapper).trigger('click');
  await flushPromises();
}

function pastePayload(text: string) {
  return {
    preventDefault: vi.fn(),
    clipboardData: {
      items: [],
      getData: (type: string) => (type === 'text/plain' ? text : '')
    }
  };
}

async function pasteSupplementText(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.find('.supplement-composer').trigger('paste', pastePayload(text));
  await flushPromises();
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
    reviewDialogOpen = vi.fn();
    artifactEditDialogOpen = vi.fn();
    eventSourceUrls = [];
    setApiRuntimeConfig({
      centerBaseUrl: 'http://127.0.0.1:8728',
      runnerBaseUrl: 'http://127.0.0.1:8718',
      userId: '1',
      projectId: '10',
      clientSessionId: '20'
    });
    vi.mocked(ElMessageBox.confirm).mockResolvedValue(undefined as never);
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '编辑后的候选经验' } as never);
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {},
      content: ''
    });
    vi.mocked(apiClient.getDeliveryWorkspace).mockResolvedValue({
      id: 1,
      projectId: 10,
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
    vi.mocked(apiClient.listTechDesignVersions).mockResolvedValue({ versions: techDesignVersions() });
    vi.mocked(apiClient.diffTechDesignVersions).mockResolvedValue({
      left: techDesignVersions()[0],
      right: techDesignVersions()[1],
      diff: '',
      truncated: false
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
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    expect(wrapper.text()).toContain('技术方案');
    expect(wrapper.text()).not.toContain('需要先通过 PRD 审核');
    expect(wrapper.text()).not.toContain('PRD 文档');
    expect(wrapper.text()).not.toContain('生成 PRD');
    expect(wrapper.text()).not.toContain('澄清 PRD');
    expect(designButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('展示需求累计 token 和当前步骤 run token 摘要', async () => {
    const current = {
      ...workflow([]),
      id: 100,
      runs: [
        {
          id: 'run-token',
          requirementId: '172014',
          actionType: 'OPENSPEC_APPLY' as const,
          stage: 'IMPLEMENTATION' as const,
          implementationStep: 'APPLY' as const,
          status: 'SUCCEEDED' as const,
          startedAt: '2026-06-22T10:20:00.000Z',
          params: {}
        }
      ]
    };
    const steps = current.implementationSteps;
    if (!steps) {
      throw new Error('测试数据缺少实施验证子步骤');
    }
    steps.ARTIFACT_REVIEW.status = 'APPROVED';
    steps.APPLY.status = 'DRAFT';
    const wrapper = await mountDetail(current, completeOpenSpecSummary());
    vi.mocked(apiClient.getRequirementTokenUsageSummary).mockResolvedValue({
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
        runId: 'run-token',
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
    });
    vi.mocked(apiClient.getRunTokenUsages).mockResolvedValue({
      runId: 'run-token',
      summary: {
        runId: 'run-token',
        totalTokens: 61129,
        inputTokens: 60835,
        cachedInputTokens: 32512,
        outputTokens: 294,
        reasoningOutputTokens: 171,
        runCount: 1,
        detailCount: 1
      },
      details: []
    });
    await (wrapper.vm as any).loadRequirementTokenUsage();
    (wrapper.vm as any).currentRunTokenUsage = await (wrapper.vm as any).loadRunTokenUsage('run-token');
    await flushPromises();

    expect(wrapper.text()).toContain('累计 Token');
    expect(wrapper.text()).toContain('61.1K');
    expect(wrapper.text()).toContain('Token 61.1K');
  });

  it('未生成 PRD 时禁用澄清入口并提示先生成文档', async () => {
    const wrapper = await mountDetail(prdWorkflow([]));

    expect(prdClarificationButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('请先生成 PRD 文档后再澄清');
  });

  it('已有 PRD 时通过弹窗提交 PRD 澄清并携带来源文件', async () => {
    const current = prdWorkflow([artifact('PRD', 'docs/172014/prd/analysis.md')]);
    current.prdSourceFiles = [
      {
        id: 'source-1',
        name: 'prd-screenshot.png',
        path: 'docs/172014/prd/files/prd-screenshot.png',
        size: 1024,
        mimeType: 'image/png',
        uploadedAt: new Date().toISOString()
      }
    ];
    const wrapper = await mountDetail(current);

    await prdClarificationButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('docs/172014/prd/analysis.md');

    await pasteSupplementText(wrapper, '补充异常场景');
    await supplementSaveButton(wrapper).trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).not.toHaveBeenCalled();
    expect(apiClient.runAction).toHaveBeenCalledWith('172014', {
      actionType: 'PRD_CLARIFY',
      params: {
        agentId: 'codex',
        executionMode: 'INTERACTIVE_TERMINAL',
        description: expect.stringContaining('补充异常场景'),
        sources: ['docs/172014/prd/files/prd-screenshot.png'],
        supplementBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'IMAGE', path: 'docs/172014/prd/files/prd-screenshot.png' }),
          expect.objectContaining({ type: 'PARAGRAPH', text: '补充异常场景' })
        ])
      }
    });
    expect(apiClient.updateSupplementInputs).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        prdClarificationBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'PARAGRAPH', text: '补充异常场景' })
        ])
      })
    );
  });

  it('已审核 PRD 提交澄清前需要确认重新审核', async () => {
    const current = prdWorkflow([artifact('PRD', 'docs/172014/prd/analysis.md')], 'APPROVED');
    const wrapper = await mountDetail(current);

    await prdClarificationButton(wrapper).trigger('click');
    await flushPromises();
    await pasteSupplementText(wrapper, '补充范围边界');
    await supplementSaveButton(wrapper).trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('回到待审核状态'), '确认澄清 PRD', expect.any(Object));
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'PRD_CLARIFY'
      })
    );
  });

  it('技术方案输入区集中展示补充输入摘要和生成动作', async () => {
    const current = defectWorkflow([]);
    const wrapper = await mountDetail(current);

    const inputPanel = wrapper.find('.design-input-panel');

    expect(inputPanel.exists()).toBe(true);
    expect(inputPanel.text()).toContain('增量上下文');
    expect(inputPanel.text()).toContain('补充输入');
    expect(inputPanel.text()).toContain('可补充文本、截图、设计稿或文件');
    expect(inputPanel.text()).toContain('技术方案答疑');
    expect(inputPanel.text()).toContain('生成技术方案');
    expect(inputPanel.find('.design-question-card').exists()).toBe(true);
    expect(inputPanel.find('.design-supplement-card').exists()).toBe(true);
    expect(inputPanel.find('.design-run-footer').exists()).toBe(true);
    expect(inputPanel.find('.design-clarification').exists()).toBe(false);
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
    vi.mocked(apiClient.listRequirements).mockClear();
    vi.mocked(apiClient.listGitCredentials).mockClear();
    vi.mocked(apiClient.refreshProjectRepositoryStatus).mockClear();
    vi.mocked(apiClient.assertRequirementWritable).mockClear();

    await openSupplementInput(wrapper);
    const input = wrapper.find<HTMLInputElement>('input.hidden-file-input');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['# design'], '补充说明.md', { type: 'text/markdown' })],
      configurable: true
    });
    await input.trigger('change');
    await flushPromises();

    expect(apiClient.uploadTechDesignFiles).toHaveBeenCalledWith('172014', expect.any(Array));
    expect(apiClient.assertRequirementWritable).toHaveBeenCalledWith(172014, '20');
    expect(apiClient.listRequirements).not.toHaveBeenCalled();
    expect(apiClient.listGitCredentials).not.toHaveBeenCalled();
    expect(apiClient.refreshProjectRepositoryStatus).not.toHaveBeenCalled();
  });

  it('保存技术方案补充输入不重新加载需求列表', async () => {
    const current = defectWorkflow([]);
    const updated = {
      ...current,
      techDesignClarification: '补充缓存边界'
    };
    vi.mocked(apiClient.updateSupplementInputs).mockResolvedValue(updated);
    const wrapper = await mountDetail(current);
    vi.mocked(apiClient.listRequirements).mockClear();

    await openSupplementInput(wrapper);
    await pasteSupplementText(wrapper, '补充缓存边界');
    await supplementSaveButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.updateSupplementInputs).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        techDesignClarification: '补充缓存边界'
      })
    );
    expect(apiClient.listRequirements).not.toHaveBeenCalled();
  });

  it('缺陷生成技术方案时携带补充说明且不传 PRD documentPath', async () => {
    const current = defectWorkflow([]);
    const wrapper = await mountDetail(current);

    await openSupplementInput(wrapper);
    await pasteSupplementText(wrapper, '补充缓存边界');
    await supplementSaveButton(wrapper).trigger('click');
    await flushPromises();
    await designButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'DESIGN_GENERATE',
        params: expect.objectContaining({
          clarification: '补充缓存边界',
          supplementBlocks: expect.arrayContaining([
            expect.objectContaining({ type: 'PARAGRAPH', text: '补充缓存边界' })
          ])
        })
      })
    );
    expect(apiClient.updateSupplementInputs).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        techDesignClarification: '补充缓存边界',
        techDesignSupplementBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'PARAGRAPH', text: '补充缓存边界' })
        ])
      })
    );
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

  it('技术方案补充弹框展示已成功消费的历史快照', async () => {
    const current = defectWorkflow([]);
    current.runs = [
      {
        id: 'run-design-history',
        requirementId: '172014',
        actionType: 'DESIGN_GENERATE',
        stage: 'TECH_DESIGN',
        status: 'SUCCEEDED',
        startedAt: '2026-07-17T09:00:00.000Z',
        finishedAt: '2026-07-17T09:02:00.000Z',
        params: {
          supplementInputPath: 'docs/172014/workflow/supplements/20260717090000-design_generate-run-design-history.md'
        }
      }
    ];
    const wrapper = await mountDetail(current);

    await openSupplementInput(wrapper);

    expect(wrapper.text()).toContain('历史输入');
    expect(wrapper.text()).toContain('技术方案生成');
    expect(wrapper.text()).toContain('20260717090000-design_generate-run-design-history.md');
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

  it('技术方案产物卡片在仅有补充材料时指向正式设计文档默认路径', async () => {
    const current = defectWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/file/screenshot.png', {
        id: 'technical-design-source-1',
        kind: 'text'
      })
    ]);
    const wrapper = await mountDetail(current);

    const card = wrapper.find('.artifact-edit-card');
    const editButton = card.findAll('button').find((item) => item.text().includes('编辑'));
    if (!editButton) {
      throw new Error('未找到技术方案编辑按钮');
    }

    expect(card.text()).toContain('docs/172014/technical-design/design_review.md');
    expect(card.text()).not.toContain('docs/172014/technical-design/file/screenshot.png');
    await editButton.trigger('click');
    expect(artifactEditDialogOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '技术方案',
        artifactPath: 'docs/172014/technical-design/design_review.md'
      })
    );
  });

  it('技术方案产物卡片在正式文档存在时展示正式文档', async () => {
    const current = defectWorkflow([
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md', {
        id: 'technical-design'
      })
    ]);
    const wrapper = await mountDetail(current);

    const card = wrapper.find('.artifact-edit-card');

    expect(card.text()).toContain('docs/172014/technical-design/design_review.md');
  });

  it('技术方案正式文档和补充材料共存时产物卡片仍展示正式文档且摘要可见', async () => {
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

    const card = wrapper.find('.artifact-edit-card');

    expect(card.text()).toContain('docs/172014/technical-design/design_review.md');
    expect(card.text()).not.toContain('docs/172014/technical-design/file/screenshot.png');
    expect(wrapper.text()).toContain('图片 1 张');
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
## 处理结论

- 因为存在重复查询。
- 缓存能减少重复读取。

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
    expect(wrapper.find('.answer-section--answer .answer-markdown h2').text()).toBe('处理结论');
    expect(wrapper.findAll('.answer-section--answer .answer-markdown li').map((item) => item.text())).toContain('缓存能减少重复读取。');

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

    expect(apiClient.readArtifact).toHaveBeenCalledWith(outputPath, 10);
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

  it('首次生成时复用单一按钮并显示生成 OpenSpec 工件', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');

    const buttons = wrapper.findAll('button').filter((item) => /生成 OpenSpec 工件|更新 OpenSpec 工件/.test(item.text()));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('生成 OpenSpec 工件');
  });

  it('已有完整 OpenSpec 工件时复用单一按钮并显示更新 OpenSpec 工件', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');

    const buttons = wrapper.findAll('button').filter((item) => /生成 OpenSpec 工件|更新 OpenSpec 工件/.test(item.text()));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('更新 OpenSpec 工件');
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
    const params = vi.mocked(apiClient.runAction).mock.calls[0][1].params || {};
    expect(params).not.toHaveProperty('baseTechDesignVersionId');
    expect(params).not.toHaveProperty('targetTechDesignVersionId');
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

  it('更新 OpenSpec 工件时提交技术方案版本和调整说明', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    current.techDesignSourceFiles = [
      {
        id: 'file-1',
        name: 'supplement.md',
        path: 'docs/172014/technical-design/file/supplement.md',
        size: 128,
        mimeType: 'text/markdown',
        uploadedAt: new Date().toISOString()
      }
    ];
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSupplementInput(wrapper);
    await pasteSupplementText(wrapper, '只按新增差异增量更新 tasks');
    await supplementSaveButton(wrapper).trigger('click');
    await flushPromises();
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          documentPath: 'docs/172014/technical-design/design_review.md',
          sourceFiles: [],
          baseTechDesignVersionId: 'snapshot:base',
          targetTechDesignVersionId: 'current',
          artifactAdjustment: expect.stringContaining('只按新增差异增量更新 tasks'),
          supplementBlocks: expect.arrayContaining([
            expect.objectContaining({ type: 'PARAGRAPH', text: '只按新增差异增量更新 tasks' })
          ])
        })
      })
    );
    expect(apiClient.updateSupplementInputs).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        openSpecArtifactAdjustment: expect.stringContaining('只按新增差异增量更新 tasks'),
        openSpecSupplementBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'PARAGRAPH', text: '只按新增差异增量更新 tasks' })
        ])
      })
    );
  });

  it('未选择视觉上下文时不通过工件补充输入默认携带技术方案图片', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    current.techDesignSourceFiles = [
      {
        id: 'image-1',
        name: 'ui.png',
        path: 'docs/172014/technical-design/file/ui.png',
        size: 256,
        mimeType: 'image/png',
        uploadedAt: new Date().toISOString()
      }
    ];
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          sourceFiles: [],
          visualContextFiles: []
        })
      })
    );
    expect(JSON.stringify(vi.mocked(apiClient.runAction).mock.calls.at(-1)?.[1])).not.toContain('docs/172014/technical-design/file/ui.png');
  });

  it('OpenSpec 工件补充输入显式保存的文件仍会进入 sourceFiles', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    current.openSpecSupplementBlocks = [
      {
        id: 'openspec-file-1',
        type: 'FILE',
        fileId: 'file-1',
        name: 'manual.md',
        path: 'docs/172014/technical-design/file/manual.md',
        size: 128,
        mimeType: 'text/markdown',
        contextRole: 'ATTACHMENT',
        status: 'READY'
      }
    ];
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          sourceFiles: ['docs/172014/technical-design/file/manual.md'],
          supplementBlocks: expect.arrayContaining([
            expect.objectContaining({ type: 'FILE', path: 'docs/172014/technical-design/file/manual.md' })
          ])
        })
      })
    );
  });

  it('默认基线只展示自动版本，点击修改后才允许选择', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');
    await flushPromises();

    expect(wrapper.findAll('.tech-design-version-select')).toHaveLength(1);
    expect(wrapper.findAll('.tech-design-version-compare')).toHaveLength(0);
    expect(wrapper.findAll('.openspec-version-compare-button')).toHaveLength(1);
    expect(wrapper.text()).toContain('自动基线');

    await wrapper.find('.openspec-edit-base-button').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.tech-design-version-select')).toHaveLength(2);
    expect(wrapper.text()).toContain('恢复自动');

    await wrapper.find('.openspec-restore-base-button').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.tech-design-version-select')).toHaveLength(1);
    expect(wrapper.text()).toContain('自动基线');
    expect(wrapper.text()).not.toContain('恢复自动');
  });

  it('默认使用最近一次未失败 OpenSpec 工件目标版本作为基线', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    current.runs = [
      {
        id: 'run-openspec-ff',
        requirementId: '172014',
        actionType: 'OPENSPEC_FF',
        stage: 'IMPLEMENTATION',
        implementationStep: 'ARTIFACT_REVIEW',
        status: 'TERMINAL_OPENED',
        startedAt: '2026-07-13T10:00:00.000Z',
        finishedAt: '2026-07-13T10:05:00.000Z',
        params: {},
        openSpecArtifactInputSnapshot: {
          baseTechDesignVersionId: 'snapshot:older',
          targetTechDesignVersionId: 'snapshot:previous',
          contextPath: 'docs/172014/implementation/artifact-review/inputs/previous.md',
          capturedAt: '2026-07-13T10:00:00.000Z'
        }
      }
    ];
    vi.mocked(apiClient.listTechDesignVersions).mockResolvedValue({
      versions: techDesignVersions([
        {
          id: 'snapshot:previous',
          label: '上次工件版本',
          artifactPath: 'docs/172014/technical-design/.versions/previous.md'
        },
        {}
      ])
    });
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          baseTechDesignVersionId: 'snapshot:previous',
          targetTechDesignVersionId: 'current'
        })
      })
    );
  });

  it('基线和目标版本一致但有调整说明时仍允许更新 OpenSpec 工件', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');
    await wrapper.find('.openspec-edit-base-button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.tech-design-version-select')[0].setValue('current');
    await openSupplementInput(wrapper);
    await pasteSupplementText(wrapper, '仅按人工说明更新 proposal');
    await supplementSaveButton(wrapper).trigger('click');
    await flushPromises();
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          baseTechDesignVersionId: 'current',
          targetTechDesignVersionId: 'current',
          artifactAdjustment: '仅按人工说明更新 proposal',
          supplementBlocks: expect.arrayContaining([
            expect.objectContaining({ type: 'PARAGRAPH', text: '仅按人工说明更新 proposal' })
          ])
        })
      })
    );
  });

  it('视觉上下文选择会保存并进入 OpenSpec 工件生成参数', async () => {
    const image = visualContextCandidate();
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const updated = {
      ...current,
      openSpecVisualContextPaths: [image.path]
    };
    const wrapper = await mountDetail(current, completeOpenSpecSummary(), [image]);
    vi.mocked(apiClient.updateSupplementInputs).mockResolvedValue(updated);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await wrapper.find('.openspec-edit-base-button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.tech-design-version-select')[0].setValue('current');
    await wrapper.find('.visual-context-open-button').trigger('click');
    await wrapper.find('.visual-context-select input').setValue(true);
    expect(apiClient.updateSupplementInputs).not.toHaveBeenCalled();
    await wrapper.find('.visual-context-confirm-button').trigger('click');
    await flushPromises();
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(apiClient.updateSupplementInputs).toHaveBeenCalledWith('172014', {
      openSpecVisualContextPaths: [image.path]
    });
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          baseTechDesignVersionId: 'current',
          targetTechDesignVersionId: 'current',
          visualContextFiles: [image.path]
        })
      })
    );
  });

  it('OpenSpec 工件生成成功后清空视觉上下文选择', async () => {
    const image = visualContextCandidate();
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    current.openSpecVisualContextPaths = [image.path];
    const wrapper = await mountDetail(current, emptyOpenSpecSummary, [image]);
    vi.mocked(apiClient.runAction).mockResolvedValue({
      run: {
        id: 'run-ff-success',
        requirementId: '172014',
        actionType: 'OPENSPEC_FF',
        stage: 'IMPLEMENTATION',
        implementationStep: 'ARTIFACT_REVIEW',
        status: 'SUCCEEDED',
        startedAt: new Date().toISOString(),
        params: {}
      },
      workflow: current
    });

    await activateImplementationStep(wrapper, '工件生成与评审');
    expect(wrapper.text()).toContain('已选 1');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('已选 0');
  });

  it('OpenSpec 工件生成失败时保留视觉上下文选择', async () => {
    const image = visualContextCandidate();
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    current.openSpecVisualContextPaths = [image.path];
    const wrapper = await mountDetail(current, emptyOpenSpecSummary, [image]);
    vi.mocked(apiClient.runAction).mockResolvedValue({
      run: {
        id: 'run-ff-failed',
        requirementId: '172014',
        actionType: 'OPENSPEC_FF',
        stage: 'IMPLEMENTATION',
        implementationStep: 'ARTIFACT_REVIEW',
        status: 'FAILED',
        startedAt: new Date().toISOString(),
        params: {}
      },
      workflow: current
    });

    await activateImplementationStep(wrapper, '工件生成与评审');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('已选 1');
  });

  it('首次生成 OpenSpec 工件时基线和目标版本一致也不拦截', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current);

    await activateImplementationStep(wrapper, '工件生成与评审');
    await wrapper.find('.openspec-edit-base-button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.tech-design-version-select')[0].setValue('current');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(ElMessage.warning).not.toHaveBeenCalledWith('基线和目标版本一致，请填写工件调整说明、选择视觉上下文、上传补充材料或选择不同版本');
    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'OPENSPEC_FF',
        params: expect.objectContaining({
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          documentPath: 'docs/172014/technical-design/design_review.md'
        })
      })
    );
    const params = vi.mocked(apiClient.runAction).mock.calls[0][1].params || {};
    expect(params).not.toHaveProperty('baseTechDesignVersionId');
    expect(params).not.toHaveProperty('targetTechDesignVersionId');
  });

  it('已有完整 OpenSpec 工件时基线和目标版本一致且无调整说明会阻止更新', async () => {
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');
    await wrapper.find('.openspec-edit-base-button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.tech-design-version-select')[0].setValue('current');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith('基线和目标版本一致，请填写工件调整说明、选择视觉上下文、上传补充材料或选择不同版本');
    expect(apiClient.runAction).not.toHaveBeenCalled();
  });

  it('目标技术方案版本不可读时阻止 OpenSpec 工件生成', async () => {
    vi.mocked(apiClient.listTechDesignVersions).mockResolvedValue({
      versions: techDesignVersions([
        {},
        {
          readable: false,
          unreadableReason: '文件不存在'
        }
      ])
    });
    const current = workflow([
      artifact('PRD', 'docs/172014/prd/analysis.md'),
      artifact('TECH_DESIGN', 'docs/172014/technical-design/design_review.md')
    ]);
    const wrapper = await mountDetail(current, completeOpenSpecSummary());

    await activateImplementationStep(wrapper, '工件生成与评审');
    await wrapper.findAll('.tech-design-version-select')[0].setValue('current');
    await openSpecArtifactButton(wrapper).trigger('click');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith('请选择可读取的技术方案目标版本');
    expect(apiClient.runAction).not.toHaveBeenCalled();
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
    const params = vi.mocked(apiClient.previewActionCommand).mock.calls[0][1].params || {};
    expect(params).not.toHaveProperty('baseTechDesignVersionId');
    expect(params).not.toHaveProperty('targetTechDesignVersionId');
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

  it('交互终端启动成功后不自动打开运行日志面板', async () => {
    const current = workflow([], false);
    const run: RunRecord = {
      id: 'run-interactive-opened',
      requirementId: current.requirementId,
      actionType: 'OPENSPEC_NEW_CHANGE',
      stage: 'IMPLEMENTATION',
      implementationStep: 'START_CHANGE',
      status: 'TERMINAL_OPENED',
      startedAt: new Date().toISOString(),
      params: { executionMode: 'INTERACTIVE_TERMINAL' },
      executionMode: 'INTERACTIVE_TERMINAL'
    };
    vi.mocked(apiClient.runAction).mockResolvedValueOnce({ run, workflow: current });
    const wrapper = await mountDetail(current);

    await wrapper.findAll('select')[1].setValue('INTERACTIVE_TERMINAL');
    await openSpecStartButton(wrapper).trigger('click');
    await flushPromises();

    expect(ElMessage.success).toHaveBeenCalledWith('已打开本地交互终端，后续交互请在终端中完成');
    expect(apiClient.getRunEvents).not.toHaveBeenCalledWith('172014', 'run-interactive-opened');
    expect(eventSourceUrls).not.toContain('runner:172014:run-interactive-opened');
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

  it('实施验证子步骤未全部通过时禁用顶层审核入口', async () => {
    const current = workflow([]);
    current.id = 100;
    const wrapper = await mountDetail(current);

    expect(implementationStageReviewButton(wrapper).attributes('disabled')).toBeDefined();
    await implementationStageReviewButton(wrapper).trigger('click');
    await flushPromises();

    expect(reviewDialogOpen).not.toHaveBeenCalled();
  });

  it('区分顶层实施验证审核和实施验证子步骤审核参数', async () => {
    const current = workflow([]);
    current.id = 100;
    const steps = current.implementationSteps;
    if (!steps) {
      throw new Error('测试数据缺少实施验证子步骤');
    }
    steps.START_CHANGE.status = 'APPROVED';
    steps.ARTIFACT_REVIEW.status = 'APPROVED';
    steps.APPLY.status = 'APPROVED';
    steps.CHANGE_INSPECTION.status = 'APPROVED';
    const wrapper = await mountDetail(current);

    expect(implementationStageReviewButton(wrapper).attributes('disabled')).toBeUndefined();
    await implementationStageReviewButton(wrapper).trigger('click');
    await flushPromises();

    expect(reviewDialogOpen).toHaveBeenLastCalledWith('IMPLEMENTATION', undefined, undefined, '172014', 100);

    reviewDialogOpen.mockClear();
    await implementationStepReviewButton(wrapper).trigger('click');
    await flushPromises();

    expect(reviewDialogOpen).toHaveBeenLastCalledWith('IMPLEMENTATION', undefined, 'CHANGE_INSPECTION', '172014', 100);
  });

  it('查看变更审核通过后触发远程 aiCommit 捕获', async () => {
    const current = workflow([]);
    current.id = 100;
    current.currentStage = 'IMPLEMENTATION';
    current.implementationSteps.START_CHANGE.status = 'APPROVED';
    current.implementationSteps.ARTIFACT_REVIEW.status = 'APPROVED';
    current.implementationSteps.APPLY.status = 'APPROVED';
    current.implementationSteps.CHANGE_INSPECTION.status = 'DRAFT';
    const wrapper = await mountDetail(current);

    await (wrapper.vm as any).submitReview({
      stage: 'IMPLEMENTATION',
      implementationStep: 'CHANGE_INSPECTION',
      decision: 'APPROVED',
      comment: ''
    });
    await flushPromises();

    expect(apiClient.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementId: '172014',
        requirementPk: 100,
        stage: 'IMPLEMENTATION',
        implementationStep: 'CHANGE_INSPECTION',
        decision: 'APPROVED'
      })
    );
    expect(apiClient.captureAiCodeCompletenessAiCommit).toHaveBeenCalledWith('172014');
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

  it('交付复盘工作台展示报告、沟通脉络、候选经验和引用反馈', async () => {
    vi.mocked(apiClient.getRequirementRetrospective).mockResolvedValue({
      summaryPath: 'docs/172014/retrospective/summary.md',
      evidencePath: 'docs/172014/retrospective/evidence.json',
      candidatePath: 'docs/172014/retrospective/memory-candidates.json',
      recallFeedbackPath: 'docs/172014/retrospective/recall-feedback.json',
      evidenceCount: 1,
      candidateCount: 1,
      pendingCandidateCount: 1,
      recallFeedbackCount: 1,
      unresolvedRiskCount: 0,
      readyForReview: false
    });
    vi.mocked(apiClient.listMemoryCandidates).mockResolvedValue({
      items: [
        {
          id: 'cand-1',
          projectId: '10',
          requirementId: '172014',
          sourceKey: 'retrospective:172014:cand-1',
          sourceType: 'RETROSPECTIVE',
          sourceRunId: 'run-retro',
          sourceText: '复盘确认该约束可沉淀',
          statement: 'opp-learn 涉及 nacos 配置读取时优先复用公共接口',
          type: 'TECH_EXPERIENCE',
          status: 'PENDING_CONFIRM',
          confidence: 0.86,
          tags: ['nacos'],
          appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
          evidence: [
            {
              sourceType: 'RETROSPECTIVE',
              requirementId: '172014',
              path: 'docs/172014/retrospective/summary.md',
              quote: '复盘确认该约束可沉淀'
            }
          ],
          createdAt: '2026-07-10T10:00:00.000Z',
          updatedAt: '2026-07-10T10:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 200
    });
    vi.mocked(apiClient.readArtifact).mockImplementation(async (filePath: string) => ({
      artifact: {},
      content: filePath.endsWith('evidence.json')
        ? JSON.stringify({
            version: 1,
            requirementId: '172014',
            items: [
              {
                id: 'evidence-1',
                sourceType: 'CLARIFICATION',
                requirementId: '172014',
                path: 'docs/172014/technical-design/questions/20260710-question.md',
                quote: '生成方案时需要参考 opp-learn 的 nacos 配置读取约束',
                actor: '架构师',
                createdAt: '2026-07-10T10:00:00.000Z'
              }
            ]
          })
        : JSON.stringify({
            version: 1,
            requirementId: '172014',
            items: [
              {
                memoryId: 'memory-1',
                status: 'PARTIAL',
                reason: '部分内容被技术方案吸收'
              }
            ]
          })
    }));

    const wrapper = await mountDetail(retrospectiveWorkflow());
    vi.mocked(apiClient.getRequirementRetrospective).mockResolvedValue({
      summaryPath: 'docs/172014/retrospective/summary.md',
      evidencePath: 'docs/172014/retrospective/evidence.json',
      candidatePath: 'docs/172014/retrospective/memory-candidates.json',
      recallFeedbackPath: 'docs/172014/retrospective/recall-feedback.json',
      evidenceCount: 1,
      candidateCount: 1,
      pendingCandidateCount: 1,
      recallFeedbackCount: 1,
      unresolvedRiskCount: 0,
      readyForReview: false
    });
    vi.mocked(apiClient.listMemoryCandidates).mockResolvedValue({
      items: [
        {
          id: 'cand-1',
          projectId: '10',
          requirementId: '172014',
          sourceKey: 'retrospective:172014:cand-1',
          sourceType: 'RETROSPECTIVE',
          sourceRunId: 'run-retro',
          sourceText: '复盘确认该约束可沉淀',
          statement: 'opp-learn 涉及 nacos 配置读取时优先复用公共接口',
          type: 'TECH_EXPERIENCE',
          status: 'PENDING_CONFIRM',
          confidence: 0.86,
          tags: ['nacos'],
          appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
          evidence: [
            {
              sourceType: 'RETROSPECTIVE',
              requirementId: '172014',
              path: 'docs/172014/retrospective/summary.md',
              quote: '复盘确认该约束可沉淀'
            }
          ],
          createdAt: '2026-07-10T10:00:00.000Z',
          updatedAt: '2026-07-10T10:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 200
    });
    vi.mocked(apiClient.readArtifact).mockImplementation(async (filePath: string) => ({
      artifact: {},
      content: filePath.endsWith('evidence.json')
        ? JSON.stringify({
            version: 1,
            requirementId: '172014',
            items: [
              {
                id: 'evidence-1',
                sourceType: 'CLARIFICATION',
                requirementId: '172014',
                path: 'docs/172014/technical-design/questions/20260710-question.md',
                quote: '生成方案时需要参考 opp-learn 的 nacos 配置读取约束',
                actor: '架构师',
                createdAt: '2026-07-10T10:00:00.000Z'
              }
            ]
          })
        : JSON.stringify({
            version: 1,
            requirementId: '172014',
            items: [
              {
                memoryId: 'memory-1',
                status: 'PARTIAL',
                reason: '部分内容被技术方案吸收'
              }
            ]
          })
    }));
    const refreshButton = wrapper.findAll('button').find((item) => item.text().includes('刷新复盘'));
    if (!refreshButton) {
      throw new Error('未找到刷新复盘按钮');
    }
    await refreshButton.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('交付复盘报告');
    expect(wrapper.text()).toContain('生成方案时需要参考 opp-learn');
    expect(wrapper.text()).toContain('opp-learn 涉及 nacos 配置读取时优先复用公共接口');
    expect(wrapper.text()).toContain('复盘说明');
    expect(wrapper.text()).toContain('当前没有未关闭风险');
  });

  it('编辑复盘候选经验只保存草稿不直接沉淀', async () => {
    const candidate = {
      id: 'cand-1',
      projectId: '10',
      requirementId: '172014',
      sourceKey: 'retrospective:172014:cand-1',
      sourceType: 'RETROSPECTIVE' as const,
      sourceRunId: 'run-retro',
      sourceText: '复盘确认该约束可沉淀',
      statement: '原始候选经验',
      type: 'TECH_EXPERIENCE' as const,
      status: 'PENDING_CONFIRM' as const,
      confidence: 0.86,
      tags: ['nacos'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN' as const] },
      evidence: [
        {
          sourceType: 'RETROSPECTIVE' as const,
          requirementId: '172014',
          path: 'docs/172014/retrospective/summary.md',
          quote: '复盘确认该约束可沉淀'
        }
      ],
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:00:00.000Z'
    };
    vi.mocked(apiClient.updateMemoryCandidate).mockResolvedValue({
      ...candidate,
      statement: '编辑后的候选经验'
    });
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '编辑后的候选经验' } as never);

    const wrapper = await mountDetail(retrospectiveWorkflow());
    vi.mocked(apiClient.getRequirementRetrospective).mockResolvedValue({
      summaryPath: 'docs/172014/retrospective/summary.md',
      evidenceCount: 0,
      candidateCount: 1,
      pendingCandidateCount: 1,
      recallFeedbackCount: 0,
      unresolvedRiskCount: 0,
      readyForReview: false
    });
    vi.mocked(apiClient.listMemoryCandidates).mockResolvedValue({
      items: [candidate],
      total: 1,
      page: 1,
      pageSize: 200
    });
    const refreshButton = wrapper.findAll('button').find((item) => item.text().includes('刷新复盘'));
    if (!refreshButton) {
      throw new Error('未找到刷新复盘按钮');
    }
    await refreshButton.trigger('click');
    await flushPromises();

    const editButton = wrapper.find('.edit-candidate');
    expect(editButton.exists()).toBe(true);
    await editButton.trigger('click');
    await flushPromises();

    expect(apiClient.updateMemoryCandidate).toHaveBeenCalledWith('cand-1', {
      statement: '编辑后的候选经验',
      tags: ['nacos']
    });
    expect(apiClient.confirmMemoryCandidate).not.toHaveBeenCalled();
    expect(ElMessage.success).toHaveBeenCalledWith('候选经验已保存');
  });

  it('交付复盘按钮触发 RETROSPECTIVE_GENERATE 动作', async () => {
    const current = retrospectiveWorkflow();
    const wrapper = await mountDetail(current);
    const button = wrapper.findAll('button').find((item) => item.text().includes('生成交付复盘'));
    if (!button) {
      throw new Error('未找到生成交付复盘按钮');
    }

    await button.trigger('click');
    await flushPromises();

    expect(apiClient.runAction).toHaveBeenCalledWith(
      '172014',
      expect.objectContaining({
        actionType: 'RETROSPECTIVE_GENERATE',
        params: expect.objectContaining({
          agentId: 'codex',
          executionMode: 'INTERACTIVE_TERMINAL',
          branchName: 'feature/opp-172014'
        })
      })
    );
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
