import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionMode, RequirementWorkflow, RunEvent, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import EmbeddedTerminalWorkbench from '../../src/components/EmbeddedTerminalWorkbench.vue';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    getRunEvents: vi.fn()
  }
}));

function run(id: string, input: Partial<RunRecord>): RunRecord {
  return {
    id,
    requirementId: '172014',
    actionType: 'OPENSPEC_APPLY',
    stage: 'IMPLEMENTATION',
    implementationStep: 'APPLY',
    status: 'RUNNING',
    startedAt: '2026-07-22T10:00:00.000Z',
    params: {},
    agentId: 'codex',
    executionMode: 'EMBEDDED_TERMINAL',
    ...input
  };
}

function workflow(runs: RunRecord[]): RequirementWorkflow {
  return {
    requirementId: '172014',
    title: '内嵌终端',
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-07-22T10:00:00.000Z',
    stages: createEmptyStages(),
    artifacts: [],
    runs,
    reviews: [],
    issues: []
  };
}

const currentRun = run('run-current', {});
const historyRun = run('run-history', {
  status: 'SUCCEEDED',
  executionMode: 'INTERACTIVE_TERMINAL',
  startedAt: '2026-07-22T09:00:00.000Z'
});
const paneReconnect = vi.fn();
const paneSendSignal = vi.fn();
const paneCopyVisibleText = vi.fn(() => 'visible terminal');

function mountWorkbench(events: RunEvent[] = [], selectedExecutionMode: ExecutionMode = 'EMBEDDED_TERMINAL') {
  return mount(EmbeddedTerminalWorkbench, {
    props: {
      workflow: workflow([currentRun, historyRun]),
      currentRun,
      events,
      selectedExecutionMode,
      activeStage: 'IMPLEMENTATION',
      activeImplementationStep: 'APPLY',
      runTokenText: '12'
    },
    global: {
      stubs: {
        EmbeddedTerminalPane: {
          props: ['runId', 'transcriptText', 'readonly'],
          template: '<pre class="embedded-terminal-pane-stub">{{ runId }} {{ transcriptText }} {{ readonly }}</pre>',
          methods: {
            reconnect: paneReconnect,
            sendSignal: paneSendSignal,
            copyVisibleText: paneCopyVisibleText
          }
        },
        ElAlert: {
          props: ['title'],
          template: '<div class="alert-stub">{{ title }}</div>'
        },
        ElButton: {
          template: '<button @click="$emit(\'click\')"><slot /></button>'
        },
        ElTag: {
          template: '<span><slot /></span>'
        },
        ElTabs: {
          template: '<div><slot /></div>'
        },
        ElTabPane: {
          template: '<div><slot /></div>'
        },
        ElEmpty: {
          template: '<div />'
        }
      }
    }
  });
}

describe('EmbeddedTerminalWorkbench', () => {
  beforeEach(() => {
    paneReconnect.mockClear();
    paneSendSignal.mockClear();
    paneCopyVisibleText.mockClear();
    vi.unstubAllGlobals();
  });

  it('展示当前内嵌终端和 raw transcript 回放', () => {
    const wrapper = mountWorkbench([
      {
        time: '2026-07-22T10:00:01.000Z',
        type: 'STDOUT',
        level: 'INFO',
        message: '终端 transcript',
        text: 'ready',
        data: {
          rawText: '\x1B[32mready\x1B[0m'
        }
      }
    ]);

    expect(wrapper.text()).toContain('Agent 终端');
    expect(wrapper.text()).toContain('run-current');
    expect(wrapper.text()).toContain('\x1B[32mready\x1B[0m');
  });

  it('保留历史会话并触发日志和取消入口', async () => {
    vi.mocked(apiClient.getRunEvents).mockResolvedValueOnce([
      {
        time: '2026-07-22T09:00:01.000Z',
        type: 'STDOUT',
        level: 'INFO',
        message: '终端 transcript',
        text: 'history output'
      }
    ]);
    const wrapper = mountWorkbench();

    expect(wrapper.text()).toContain('外部交互终端');
    await wrapper.find('.terminal-history-item').trigger('click');
    await wrapper.findAll('button').find((button) => button.text().includes('结束会话'))?.trigger('click');

    expect(wrapper.emitted('cancel-run')?.[0]).toEqual(['run-current']);
    expect(apiClient.getRunEvents).toHaveBeenCalledWith('172014', 'run-current');
  });

  it('支持重连、Ctrl-C 和复制当前可见内容', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText
      }
    });
    const wrapper = mountWorkbench();
    const buttons = wrapper.findAll('.terminal-toolbar button');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');

    expect(paneReconnect).toHaveBeenCalled();
    expect(paneSendSignal).toHaveBeenCalledWith('SIGINT');
    expect(writeText).toHaveBeenCalledWith('visible terminal');
  });

  it('外部终端模式展示兜底提示', () => {
    const wrapper = mountWorkbench([], 'INTERACTIVE_TERMINAL');

    expect(wrapper.text()).toContain('当前选择外部交互终端');
  });
});
