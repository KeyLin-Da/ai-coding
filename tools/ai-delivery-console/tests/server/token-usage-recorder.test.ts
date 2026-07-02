import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { recordCodexUsageEvents, retryTokenUsageOutbox } from '../../server/services/token-usage-recorder';
import { resolveWorkspaceOrRuntimePath } from '../../server/services/runtime-paths';

describe('token-usage-recorder', () => {
  it('Center 失败时落盘，后续重试成功后清空 outbox', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'token-outbox-'));
    const workflow = createWorkflow();
    const run: RunRecord = {
      id: 'run-outbox',
      requirementId: workflow.requirementId,
      actionType: 'DESIGN_GENERATE',
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      params: {},
      agentId: 'codex',
      centerRunId: 900
    };
    workflow.runs.push(run);
    const failedFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, message: 'center down' })
    });
    const successFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { detail: { id: 1 } } })
    });

    await recordCodexUsageEvents(root, workflow, run, 'codex', [{
      seq: 1,
      eventId: 'session-1:10:2',
      sourceEventType: 'token_count',
      model: 'gpt-5.5',
      usage: {
        inputTokens: 10,
        cachedInputTokens: 4,
        outputTokens: 2,
        reasoningOutputTokens: 1,
        totalTokens: 12
      },
      rawUsageJson: '{"input_tokens":10}',
      rawEventJson: '{"type":"token_count"}'
    }], {
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: 1,
      clientSessionId: 10,
      fetchImpl: failedFetch as unknown as typeof fetch
    });

    expect(run.tokenUsageOutboxPath).toContain('token-usage-outbox');
    const outboxPath = run.tokenUsageOutboxPath;
    if (!outboxPath) {
      throw new Error('Token usage outbox 未落盘');
    }
    const outboxFiles = await fs.readdir(resolveWorkspaceOrRuntimePath(root, outboxPath));
    expect(outboxFiles).toHaveLength(1);
    expect(outboxFiles[0]).toMatch(/\.json$/);

    const changed = await retryTokenUsageOutbox(root, workflow, run, {
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: 1,
      clientSessionId: 10,
      fetchImpl: successFetch as unknown as typeof fetch
    });

    expect(changed).toBe(true);
    expect(run.tokenUsageOutboxPath).toBeUndefined();
    expect(successFetch).toHaveBeenCalledTimes(1);
  });
});

function createWorkflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '174545',
    title: 'Token test',
    sources: [],
    currentStage: 'TECH_DESIGN',
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
