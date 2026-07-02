import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../../shared/workflow';
import { collectCodexSessionUsage } from '../../server/services/codex-session-usage';

function runRecord(id: string): RunRecord {
  return {
    id,
    requirementId: '174545',
    actionType: 'DESIGN_GENERATE',
    status: 'TERMINAL_OPENED',
    startedAt: new Date().toISOString(),
    params: {},
    agentId: 'codex',
    executionMode: 'INTERACTIVE_TERMINAL'
  };
}

describe('codex-session-usage', () => {
  it('定位交互 Session，并将重复累计快照转换为唯一增量明细', async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-home-'));
    const sessionDir = path.join(codexHome, 'sessions', '2026', '06', '22');
    await fs.mkdir(sessionDir, { recursive: true });
    const sessionPath = path.join(sessionDir, 'rollout-test.jsonl');
    const run = runRecord('run-session-usage');
    const lines = [
      { timestamp: '2026-06-22T03:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } },
      { timestamp: '2026-06-22T03:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.5' } },
      { timestamp: '2026-06-22T03:00:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: `Run ID: ${run.id}` } },
      tokenCount('2026-06-22T03:00:03.000Z', 10, 4, 2, 1),
      tokenCount('2026-06-22T03:00:04.000Z', 10, 4, 2, 1),
      tokenCount('2026-06-22T03:00:05.000Z', 15, 6, 3, 1)
    ];
    await fs.writeFile(sessionPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');

    const result = await collectCodexSessionUsage(run, codexHome);

    expect(run.codexSessionId).toBe('session-1');
    expect(run.codexSessionModel).toBe('gpt-5.5');
    expect(result.events).toHaveLength(2);
    expect(result.events[0].usage).toMatchObject({
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 2,
      reasoningOutputTokens: 1,
      totalTokens: 12
    });
    expect(result.events[1].usage).toMatchObject({
      inputTokens: 5,
      cachedInputTokens: 2,
      outputTokens: 1,
      reasoningOutputTokens: 0,
      totalTokens: 6
    });
  });

  it('保留未完成 JSONL 半行并在后续追加完整后再解析', async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-home-'));
    const sessionDir = path.join(codexHome, 'sessions', '2026', '06', '22');
    await fs.mkdir(sessionDir, { recursive: true });
    const sessionPath = path.join(sessionDir, 'rollout-partial.jsonl');
    const run = runRecord('run-session-partial');
    const prefix = [
      JSON.stringify({ timestamp: '2026-06-22T03:00:00.000Z', type: 'session_meta', payload: { id: 'session-2' } }),
      JSON.stringify({ timestamp: '2026-06-22T03:00:01.000Z', type: 'event_msg', payload: { type: 'user_message', message: run.id } })
    ].join('\n');
    const tokenLine = JSON.stringify(tokenCount('2026-06-22T03:00:02.000Z', 20, 8, 4, 2));
    const splitAt = Math.floor(tokenLine.length / 2);
    await fs.writeFile(sessionPath, `${prefix}\n${tokenLine.slice(0, splitAt)}`, 'utf8');

    const first = await collectCodexSessionUsage(run, codexHome);
    await fs.appendFile(sessionPath, `${tokenLine.slice(splitAt)}\n`, 'utf8');
    const second = await collectCodexSessionUsage(run, codexHome);

    expect(first.events).toHaveLength(0);
    expect(second.events).toHaveLength(1);
    expect(second.events[0].usage.totalTokens).toBe(24);
  });
});

function tokenCount(
  timestamp: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningOutputTokens: number
) {
  return {
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: cachedInputTokens,
          output_tokens: outputTokens,
          reasoning_output_tokens: reasoningOutputTokens,
          total_tokens: inputTokens + outputTokens
        }
      }
    }
  };
}
