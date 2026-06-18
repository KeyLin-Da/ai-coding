import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProvider, RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { apiClient } from '../../src/api/client';
import { setApiRuntimeConfig } from '../../src/api/runtime';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '补充材料',
    requirementType: 'DEFECT',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages('DEFECT'),
    artifacts: [
      {
        id: 'technical-design',
        stage: 'TECH_DESIGN',
        label: '技术方案评审文档',
        path: 'docs/172014/technical-design/design_review.md',
        kind: 'markdown',
        exists: true
      }
    ],
    runs: [],
    reviews: [],
    issues: []
  };
}

function centerRequirement() {
  return {
    id: 100,
    projectId: 10,
    requirementId: '172014',
    title: '补充材料',
    requirementType: 'DEFECT',
    branchName: 'bugfix/opp#172014',
    currentStage: 'TECH_DESIGN',
    status: 'DRAFT',
    stages: [
      {
        stage: 'TECH_DESIGN',
        status: 'DRAFT'
      }
    ],
    projectNames: ['opp-admin-vue']
  };
}

function okResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data })
  } as Response);
}

describe('apiClient Runner docs endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      centerBaseUrl: 'https://center.example.com',
      runnerBaseUrl: 'http://127.0.0.1:8718',
      userId: '1',
      projectId: '10',
      clientSessionId: '20'
    });
  });

  it('需求列表优先从 Runner 读取中心状态和本地产物合并结果', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse([workflow()]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.listRequirements();

    expect(result[0].requirementType).toBe('DEFECT');
    expect(result[0].artifacts).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/runner-api/api/ai-delivery/requirements?projectId=10');
    expect(init.headers['X-Project-Id']).toBe('10');
  });

  it('Agent Provider 列表从本地 Runner 读取', async () => {
    const agents: AgentProvider[] = [
      {
        id: 'codex',
        name: 'Codex',
        inputMode: 'STDIN',
        available: true,
        supportsStreaming: true
      }
    ];
    const fetchMock = vi.fn().mockImplementation(() => okResponse(agents));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.listAgents();

    expect(result).toEqual(agents);
    expect(fetchMock).toHaveBeenCalledWith('/runner-api/api/ai-delivery/agents', expect.any(Object));
  });

  it('需求详情优先从 Runner 合并接口读取，保留本地扫描产物', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse(workflow()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.getRequirement('172014');

    expect(result.currentStage).toBe('TECH_DESIGN');
    expect(result.artifacts[0].path).toBe('docs/172014/technical-design/design_review.md');
    expect(fetchMock).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/requirements/172014?projectId=10',
      expect.any(Object)
    );
  });

  it('Runner 不可用时需求详情兜底中心服务，仍能打开基础详情', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('runner down'))
      .mockImplementationOnce(() => okResponse(centerRequirement()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.getRequirement('172014');

    expect(result.currentStage).toBe('TECH_DESIGN');
    expect(result.artifacts).toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/runner-api/api/ai-delivery/requirements/172014?projectId=10',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/center-api/api/ai-delivery/requirements/172014?projectId=10',
      expect.any(Object)
    );
  });

  it('补充材料上传提交到本地 Runner', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse(workflow()));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['# design'], '补充说明.md', { type: 'text/markdown' });

    await apiClient.uploadTechDesignFiles('172014', [file]);

    expect(fetchMock).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/requirements/172014/tech-design-files',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      })
    );
  });

  it('流程动作提交到本地 Runner 执行', async () => {
    const current = workflow();
    const fetchMock = vi.fn().mockImplementation(() =>
      okResponse({
        run: {
          id: 'run-1',
          requirementId: current.requirementId,
          actionType: 'DESIGN_GENERATE',
          status: 'RUNNING',
          startedAt: new Date().toISOString(),
          params: {}
        },
        workflow: current
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.runAction('172014', { actionType: 'DESIGN_GENERATE' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/requirements/172014/actions',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('命令预览提交到本地 Runner', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse({ commandText: '/coding-design r=172014 d=test' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.previewActionCommand('172014', { actionType: 'DESIGN_GENERATE' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/requirements/172014/actions/command',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('运行日志从中心补偿 API 读取', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      okResponse([
        {
          id: 1,
          runId: 100,
          seq: 1,
          createdAt: '2026-06-10T01:22:46.000Z',
          type: 'STDOUT',
          level: 'INFO',
          message: '开始执行',
          payloadJson: '{"step":"start"}'
        }
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = await apiClient.getRunEvents('172014', '100');

    expect(fetchMock).toHaveBeenCalledWith(
      '/center-api/api/ai-delivery/runs/100/events?afterSeq=0',
      expect.any(Object)
    );
    expect(events[0]).toMatchObject({
      time: '2026-06-10T01:22:46.000Z',
      type: 'STDOUT',
      text: '开始执行',
      data: { step: 'start' }
    });
  });

  it('本地 Runner 字符串 runId 的运行日志从 Runner 读取', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      okResponse([
        {
          time: '2026-06-17T11:06:58.000Z',
          type: 'START',
          level: 'INFO',
          message: '开始执行本地 run'
        }
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = await apiClient.getRunEvents('164946', 'run-20260617110658-10d25f');

    expect(fetchMock).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/runs/run-20260617110658-10d25f/events?requirementId=164946',
      expect.any(Object)
    );
    expect(events[0]).toMatchObject({
      type: 'START',
      message: '开始执行本地 run'
    });
  });

  it('本地 Runner 字符串 runId 的实时日志使用 Runner SSE', () => {
    const eventSource = vi.fn();
    vi.stubGlobal('EventSource', eventSource);

    apiClient.openRunEventStream('164946', 'run-20260617110658-10d25f');

    expect(eventSource).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/runs/run-20260617110658-10d25f/stream?requirementId=164946&tail=1&projectId=10&clientSessionId=20&userId=1&centerBaseUrl=https%3A%2F%2Fcenter.example.com'
    );
  });

  it('取消运行提交到本地 Runner', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse({ cancelled: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.cancelRun('172014', 'run-20260610012246-5eef8c');

    expect(fetchMock).toHaveBeenCalledWith(
      '/runner-api/api/ai-delivery/runs/run-20260610012246-5eef8c/cancel',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
});
