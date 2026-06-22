export interface NormalizedCodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface CodexUsageEvent {
  seq: number;
  eventId?: string;
  sourceEventType: string;
  model?: string;
  usage: NormalizedCodexUsage;
  rawUsageJson: string;
  rawEventJson: string;
  occurredAt?: string;
}

export class CodexUsageNdjsonParser {
  private buffer = '';
  private seq = 0;

  push(chunk: string): CodexUsageEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    return lines.flatMap((line) => this.parseLine(line));
  }

  flush(): CodexUsageEvent[] {
    const tail = this.buffer;
    this.buffer = '';
    return tail ? this.parseLine(tail) : [];
  }

  private parseLine(line: string): CodexUsageEvent[] {
    const trimmed = line.trim();
    if (!trimmed) {
      return [];
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return [];
    }
    const sourceEventType = stringValue(event.type) || stringValue(event.event) || '';
    const usageSource = recordValue(event.usage) || recordValue(recordValue(event.item)?.usage);
    if (sourceEventType !== 'turn.completed' || !usageSource) {
      return [];
    }
    const usage = normalizeUsage(usageSource);
    if (!usage) {
      return [];
    }
    this.seq += 1;
    return [
      {
        seq: this.seq,
        eventId: stringValue(event.id) || stringValue(recordValue(event.item)?.id),
        sourceEventType,
        model: stringValue(event.model) || stringValue(recordValue(event.response)?.model) || stringValue(recordValue(event.item)?.model),
        usage,
        rawUsageJson: JSON.stringify(usageSource),
        rawEventJson: trimmed
      }
    ];
  }
}

function normalizeUsage(source: Record<string, unknown>): NormalizedCodexUsage | undefined {
  const inputTokens = numberValue(source.inputTokens ?? source.input_tokens);
  const outputTokens = numberValue(source.outputTokens ?? source.output_tokens);
  const cachedInputTokens = numberValue(
    source.cachedInputTokens ??
      source.cached_input_tokens ??
      recordValue(source.inputTokenDetails)?.cachedTokens ??
      recordValue(source.input_token_details)?.cached_tokens
  );
  const reasoningOutputTokens = numberValue(
    source.reasoningOutputTokens ??
      source.reasoning_output_tokens ??
      recordValue(source.outputTokenDetails)?.reasoningTokens ??
      recordValue(source.output_token_details)?.reasoning_tokens
  );
  if (inputTokens === undefined && outputTokens === undefined && cachedInputTokens === undefined && reasoningOutputTokens === undefined) {
    return undefined;
  }
  const normalizedInput = inputTokens || 0;
  const normalizedOutput = outputTokens || 0;
  return {
    inputTokens: normalizedInput,
    cachedInputTokens: cachedInputTokens || 0,
    outputTokens: normalizedOutput,
    reasoningOutputTokens: reasoningOutputTokens || 0,
    totalTokens: normalizedInput + normalizedOutput
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}
