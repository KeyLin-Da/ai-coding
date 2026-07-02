import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RunRecord, TokenUsageSnapshot } from '../../shared/workflow';
import type { CodexUsageEvent } from './codex-usage-parser';

export interface CodexSessionUsageResult {
  changed: boolean;
  events: CodexUsageEvent[];
}

export async function collectCodexSessionUsage(run: RunRecord, codexHome = resolveCodexHome()): Promise<CodexSessionUsageResult> {
  let changed = false;
  if (!run.codexSessionPath) {
    const matched = await findSessionFile(run, codexHome);
    if (!matched) {
      return { changed: false, events: [] };
    }
    run.codexSessionPath = matched;
    run.codexSessionOffset = 0;
    changed = true;
  }

  const buffer = await fs.readFile(run.codexSessionPath).catch(() => Buffer.alloc(0));
  const offset = Math.min(run.codexSessionOffset || 0, buffer.length);
  const unread = buffer.subarray(offset);
  const lastNewline = unread.lastIndexOf(0x0a);
  if (lastNewline < 0) {
    return { changed, events: [] };
  }
  const complete = unread.subarray(0, lastNewline + 1).toString('utf8');
  run.codexSessionOffset = offset + lastNewline + 1;
  changed = true;

  const events: CodexUsageEvent[] = [];
  for (const line of complete.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let entry: Record<string, any>;
    try {
      entry = JSON.parse(line) as Record<string, any>;
    } catch {
      continue;
    }
    if (entry.type === 'session_meta' && entry.payload?.id) {
      run.codexSessionId = String(entry.payload.id);
    }
    if (entry.type === 'turn_context' && entry.payload?.model) {
      run.codexSessionModel = String(entry.payload.model);
    }
    if (entry.type !== 'event_msg' || entry.payload?.type !== 'token_count') {
      continue;
    }
    const total = normalizeSnapshot(entry.payload?.info?.total_token_usage);
    if (!total || sameSnapshot(total, run.codexTokenSnapshot)) {
      continue;
    }
    const delta = snapshotDelta(total, run.codexTokenSnapshot);
    run.codexTokenSnapshot = total;
    events.push({
      seq: events.length + 1,
      eventId: `${run.codexSessionId || path.basename(run.codexSessionPath)}:${snapshotKey(total)}`,
      sourceEventType: 'token_count',
      model: run.codexSessionModel,
      usage: delta,
      rawUsageJson: JSON.stringify(total),
      rawEventJson: line.trim(),
      occurredAt: typeof entry.timestamp === 'string' ? entry.timestamp : undefined
    });
  }
  return { changed, events };
}

function resolveCodexHome(): string {
  return process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
}

async function findSessionFile(run: RunRecord, codexHome: string): Promise<string | undefined> {
  const sessionRoot = path.join(codexHome, 'sessions');
  const threshold = new Date(run.startedAt).getTime() - 30_000;
  const files = await listRecentJsonl(sessionRoot, threshold);
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8').catch(() => '');
    if (content.includes(run.id) && content.includes('"type":"session_meta"')) {
      return file;
    }
  }
  return undefined;
}

async function listRecentJsonl(root: string, threshold: number): Promise<string[]> {
  const found: Array<{ path: string; mtimeMs: number }> = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const stat = await fs.stat(absolute).catch(() => undefined);
        if (stat && stat.mtimeMs >= threshold) {
          found.push({ path: absolute, mtimeMs: stat.mtimeMs });
        }
      }
    }
  };
  await visit(root);
  return found.sort((left, right) => right.mtimeMs - left.mtimeMs).map((item) => item.path);
}

function normalizeSnapshot(value: unknown): TokenUsageSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const inputTokens = nonNegativeNumber(source.input_tokens ?? source.inputTokens);
  const cachedInputTokens = nonNegativeNumber(source.cached_input_tokens ?? source.cachedInputTokens);
  const outputTokens = nonNegativeNumber(source.output_tokens ?? source.outputTokens);
  const reasoningOutputTokens = nonNegativeNumber(source.reasoning_output_tokens ?? source.reasoningOutputTokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  return {
    inputTokens,
    cachedInputTokens: cachedInputTokens || 0,
    outputTokens,
    reasoningOutputTokens: reasoningOutputTokens || 0,
    totalTokens: inputTokens + outputTokens
  };
}

function nonNegativeNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function snapshotDelta(current: TokenUsageSnapshot, previous?: TokenUsageSnapshot): TokenUsageSnapshot {
  if (!previous || current.totalTokens < previous.totalTokens) {
    return current;
  }
  const inputTokens = Math.max(0, current.inputTokens - previous.inputTokens);
  const outputTokens = Math.max(0, current.outputTokens - previous.outputTokens);
  return {
    inputTokens,
    cachedInputTokens: Math.max(0, current.cachedInputTokens - previous.cachedInputTokens),
    outputTokens,
    reasoningOutputTokens: Math.max(0, current.reasoningOutputTokens - previous.reasoningOutputTokens),
    totalTokens: inputTokens + outputTokens
  };
}

function sameSnapshot(left: TokenUsageSnapshot, right?: TokenUsageSnapshot): boolean {
  return Boolean(right && snapshotKey(left) === snapshotKey(right));
}

function snapshotKey(value: TokenUsageSnapshot): string {
  return [
    value.inputTokens,
    value.cachedInputTokens,
    value.outputTokens,
    value.reasoningOutputTokens,
    value.totalTokens
  ].join(':');
}
