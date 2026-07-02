import { describe, expect, it } from 'vitest';
import { CodexUsageNdjsonParser } from '../../server/services/codex-usage-parser';

describe('codex-usage-parser', () => {
  it('解析 turn.completed usage 并兼容 snake_case 字段', () => {
    const parser = new CodexUsageNdjsonParser();
    const events = parser.push(
      '{"type":"turn.completed","id":"turn-1","model":"gpt-5","usage":{"input_tokens":60835,"cached_input_tokens":32512,"output_tokens":294,"reasoning_output_tokens":171}}\n'
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      seq: 1,
      eventId: 'turn-1',
      sourceEventType: 'turn.completed',
      model: 'gpt-5',
      usage: {
        inputTokens: 60835,
        cachedInputTokens: 32512,
        outputTokens: 294,
        reasoningOutputTokens: 171,
        totalTokens: 61129
      }
    });
  });

  it('支持 chunk 跨行和 camelCase 字段', () => {
    const parser = new CodexUsageNdjsonParser();
    expect(parser.push('{"type":"turn.completed","usage":{"inputTokens":10,')).toEqual([]);
    const events = parser.push('"cachedInputTokens":4,"outputTokens":2,"reasoningOutputTokens":1}}\n');

    expect(events).toHaveLength(1);
    expect(events[0].usage).toMatchObject({
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 2,
      reasoningOutputTokens: 1,
      totalTokens: 12
    });
  });

  it('忽略非 usage 事件和解析失败的普通 stdout', () => {
    const parser = new CodexUsageNdjsonParser();
    const events = parser.push('plain stdout\n{"type":"item.completed"}\n{"type":"turn.completed","usage":{}}\n');

    expect(events).toEqual([]);
  });

  it('flush 处理未换行的最后一条完整 JSON', () => {
    const parser = new CodexUsageNdjsonParser();
    parser.push('{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}');

    const events = parser.flush();

    expect(events).toHaveLength(1);
    expect(events[0].usage.totalTokens).toBe(2);
  });
});
