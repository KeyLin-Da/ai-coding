import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequirementWorkflow, RunRecord } from '../../shared/workflow';
import type { CodexUsageEvent } from './codex-usage-parser';
import {
  uploadCenterRunTokenUsage,
  type CenterRunTokenUsagePayload,
  type CenterRunnerConfig
} from './center-runner-adapter';
import { appendRunEvent } from './run-log';
import { getRunRuntimeDir, toRuntimePathRef } from './runtime-paths';

interface TokenUsageOutboxItem {
  usageFingerprint: string;
  payload: CenterRunTokenUsagePayload;
}

export async function recordCodexUsageEvents(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  providerId: string,
  events: CodexUsageEvent[],
  centerConfig?: CenterRunnerConfig
): Promise<void> {
  for (const event of events) {
    const usageFingerprint = buildTokenUsageFingerprint(run.id, event);
    const centerUpload = run.centerRunId ? 'PENDING' : 'SKIPPED_NO_CENTER_RUN';
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'INFO',
      level: 'INFO',
      message: `Token usage: total ${event.usage.totalTokens}, input ${event.usage.inputTokens}, output ${event.usage.outputTokens}`,
      text: event.rawEventJson,
      agentId: providerId,
      data: {
        kind: 'TOKEN_USAGE',
        sourceEventType: event.sourceEventType,
        model: event.model,
        usageFingerprint,
        centerUpload,
        usage: event.usage
      },
      time: event.occurredAt || new Date().toISOString()
    });
    if (!run.centerRunId) {
      continue;
    }

    const payload: CenterRunTokenUsagePayload = {
      runId: run.centerRunId,
      seq: event.seq,
      stage: run.stage,
      implementationStep: run.implementationStep,
      agentId: providerId,
      model: event.model,
      sourceEventType: event.sourceEventType,
      usageFingerprint,
      usage: {
        inputTokens: event.usage.inputTokens,
        cachedInputTokens: event.usage.cachedInputTokens,
        outputTokens: event.usage.outputTokens,
        reasoningOutputTokens: event.usage.reasoningOutputTokens
      },
      rawUsageJson: event.rawUsageJson,
      occurredAt: event.occurredAt || new Date().toISOString()
    };

    if (!centerConfig?.centerBaseUrl) {
      await persistOutboxItem(workspaceRoot, workflow.requirementId, run, { usageFingerprint, payload });
      continue;
    }
    try {
      await uploadCenterRunTokenUsage(centerConfig, payload);
      await removeOutboxItem(workspaceRoot, workflow.requirementId, run, usageFingerprint);
    } catch (error: any) {
      await persistOutboxItem(workspaceRoot, workflow.requirementId, run, { usageFingerprint, payload });
      await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: 'WARN',
        level: 'WARN',
        message: `Token usage Center 上报失败，已进入待上传队列：${error?.message || 'unknown error'}`,
        agentId: providerId,
        data: { kind: 'TOKEN_USAGE_UPLOAD_FAILED', usageFingerprint }
      });
    }
  }
}

export async function retryTokenUsageOutbox(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  centerConfig?: CenterRunnerConfig
): Promise<boolean> {
  if (!run.centerRunId || !centerConfig?.centerBaseUrl) {
    return false;
  }
  const directory = outboxDirectory(workspaceRoot, workflow.requirementId, run.id);
  const files = (await fs.readdir(directory).catch(() => [])).filter((file) => file.endsWith('.json'));
  let changed = false;
  for (const file of files) {
    const absolutePath = path.join(directory, file);
    const item = JSON.parse(await fs.readFile(absolutePath, 'utf8')) as TokenUsageOutboxItem;
    try {
      await uploadCenterRunTokenUsage(centerConfig, item.payload);
      await fs.unlink(absolutePath).catch(() => undefined);
      changed = true;
    } catch {
      // Keep the item for a later authenticated retry.
    }
  }
  if (changed && !(await fs.readdir(directory).catch(() => [])).length) {
    await fs.rmdir(directory).catch(() => undefined);
    run.tokenUsageOutboxPath = undefined;
  }
  return changed;
}

export async function retryWorkflowTokenUsageOutboxes(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  centerConfig?: CenterRunnerConfig
): Promise<boolean> {
  let changed = false;
  for (const run of workflow.runs) {
    if (await retryTokenUsageOutbox(workspaceRoot, workflow, run, centerConfig)) {
      changed = true;
    }
  }
  return changed;
}

function buildTokenUsageFingerprint(runId: string, event: CodexUsageEvent): string {
  const seed = event.eventId
    ? `${runId}|${event.eventId}`
    : `${runId}|${event.seq}|${event.rawUsageJson}`;
  return createHash('sha256').update(seed).digest('hex');
}

async function persistOutboxItem(
  workspaceRoot: string,
  requirementId: string,
  run: RunRecord,
  item: TokenUsageOutboxItem
): Promise<void> {
  const directory = outboxDirectory(workspaceRoot, requirementId, run.id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${item.usageFingerprint}.json`), JSON.stringify(item), 'utf8');
  run.tokenUsageOutboxPath = toRuntimePathRef(workspaceRoot, directory);
}

async function removeOutboxItem(
  workspaceRoot: string,
  requirementId: string,
  run: RunRecord,
  usageFingerprint: string
): Promise<void> {
  const directory = outboxDirectory(workspaceRoot, requirementId, run.id);
  await fs.unlink(path.join(directory, `${usageFingerprint}.json`)).catch(() => undefined);
}

function outboxDirectory(workspaceRoot: string, requirementId: string, runId: string): string {
  return path.join(getRunRuntimeDir(workspaceRoot, requirementId), `${runId}.token-usage-outbox`);
}
