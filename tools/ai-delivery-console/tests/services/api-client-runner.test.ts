import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
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
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
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

  it('需求列表从 Runner 读取以合并项目目录 docs', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse([workflow()]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.listRequirements();

    expect(result[0].requirementType).toBe('DEFECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8718/api/ai-delivery/requirements?projectId=10');
    expect(init.headers['X-Project-Id']).toBe('10');
  });

  it('补充材料上传提交到本地 Runner', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse(workflow()));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['# design'], '补充说明.md', { type: 'text/markdown' });

    await apiClient.uploadTechDesignFiles('172014', [file]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8718/api/ai-delivery/requirements/172014/tech-design-files',
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
      'http://127.0.0.1:8718/api/ai-delivery/requirements/172014/actions',
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
      'http://127.0.0.1:8718/api/ai-delivery/requirements/172014/actions/command',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('运行日志从本地 Runner 读取', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      okResponse([
        {
          time: '2026-06-10T01:22:46.000Z',
          type: 'INFO',
          level: 'INFO',
          message: '开始执行'
        }
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.getRunEvents('172014', 'run-20260610012246-5eef8c');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8718/api/ai-delivery/runs/run-20260610012246-5eef8c/events?requirementId=172014',
      expect.any(Object)
    );
  });

  it('取消运行提交到本地 Runner', async () => {
    const fetchMock = vi.fn().mockImplementation(() => okResponse({ cancelled: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.cancelRun('172014', 'run-20260610012246-5eef8c');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8718/api/ai-delivery/runs/run-20260610012246-5eef8c/cancel',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
});
