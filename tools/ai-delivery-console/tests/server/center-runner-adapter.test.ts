import { describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  buildCenterJobCreatePayload,
  cancelCenterJob,
  claimCenterJob,
  createCenterJob,
  mapRunEventToCenter,
  uploadCenterRunEvent,
  renewCenterJob,
  uploadCenterRunTokenUsage
} from '../../server/services/center-runner-adapter';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
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

describe('center-runner-adapter', () => {
  it('将本地 ActionInput 映射为中心服务 Job 创建请求', () => {
    const payload = buildCenterJobCreatePayload(workflow(), {
      actionType: 'OPENSPEC_APPLY',
      params: {
        requirementPk: 100,
        changeName: 'delivery-console-desktop-collaboration'
      }
    });

    expect(payload.requirementPk).toBe(100);
    expect(payload.actionType).toBe('OPENSPEC_APPLY');
    expect(JSON.parse(payload.paramsJson)).toMatchObject({
      requirementId: '172014',
      title: '定位菜单',
      changeName: 'delivery-console-desktop-collaboration'
    });
  });

  it('映射本地运行日志为中心 run event', () => {
    const payload = mapRunEventToCenter(
      900,
      {
        time: new Date().toISOString(),
        type: 'STDERR',
        level: 'WARN',
        message: 'stderr',
        text: 'warning line'
      },
      2
    );

    expect(payload).toMatchObject({
      runId: 900,
      seq: 2,
      level: 'WARN',
      type: 'stderr',
      message: 'warning line'
    });
  });

  it('向中心服务上传 Job 和 run event 时携带用户头', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 500 } })
    });
    const config = {
      centerBaseUrl: 'http://127.0.0.1:8728/',
      userId: 1,
      clientSessionId: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch
    };

    await createCenterJob(config, {
      requirementPk: 100,
      actionType: 'CODE_REVIEW',
      paramsJson: '{}'
    });
    await uploadCenterRunEvent(config, {
      runId: 900,
      level: 'INFO',
      type: 'stdout',
      message: 'ok'
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8728/api/ai-delivery/jobs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-User-Id': '1'
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8728/api/ai-delivery/run-events',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('按指定 Job 建立 Center Run 并续租', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 500, runId: 900, status: 'CLAIMED' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 500, runId: 900, status: 'CLAIMED' } })
      });
    const config = {
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: 1,
      clientSessionId: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch
    };

    const claimed = await claimCenterJob(config, 500);
    await renewCenterJob(config, 500);

    expect(claimed.runId).toBe(900);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8728/api/ai-delivery/jobs/500/claim',
      expect.objectContaining({ body: expect.stringContaining('"capabilities":["ALL"]') })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8728/api/ai-delivery/jobs/500/renew',
      expect.objectContaining({ body: expect.stringContaining('"clientSessionId":10') })
    );
  });

  it('取消运行时调用 Center cancel 接口', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 500, status: 'CANCELLED' } })
    });

    await cancelCenterJob({
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: 1,
      clientSessionId: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch
    }, 500);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8728/api/ai-delivery/jobs/500/cancel',
      expect.objectContaining({
        method: 'POST',
        body: '{}'
      })
    );
  });

  it('向中心服务上传 token usage payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { detail: { id: 1 } } })
    });

    await uploadCenterRunTokenUsage(
      {
        centerBaseUrl: 'http://127.0.0.1:8728',
        userId: 1,
        clientSessionId: 10,
        fetchImpl: fetchImpl as unknown as typeof fetch
      },
      {
        runId: 900,
        seq: 3,
        stage: 'TECH_DESIGN',
        agentId: 'codex',
        sourceEventType: 'turn.completed',
        usageFingerprint: 'abc',
        usage: {
          inputTokens: 10,
          cachedInputTokens: 4,
          outputTokens: 2,
          reasoningOutputTokens: 1
        },
        rawUsageJson: '{"input_tokens":10}'
      }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8728/api/ai-delivery/run-token-usages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"sourceEventType":"turn.completed"')
      })
    );
  });
});
