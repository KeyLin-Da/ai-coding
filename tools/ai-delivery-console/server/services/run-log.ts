import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunEvent } from '../../shared/workflow';
import { createId, normalizeRequirementId } from './workspace';

export function createRunId(): string {
  return createId('run');
}

export function getRunDir(workspaceRoot: string, requirementId: string): string {
  return path.join(workspaceRoot, 'docs', normalizeRequirementId(requirementId), 'workflow', 'runs');
}

export function getRunPath(workspaceRoot: string, requirementId: string, runId: string): string {
  return path.join(getRunDir(workspaceRoot, requirementId), `${runId}.jsonl`);
}

export async function appendRunEvent(workspaceRoot: string, requirementId: string, runId: string, event: Omit<RunEvent, 'time'>): Promise<void> {
  await fs.mkdir(getRunDir(workspaceRoot, requirementId), { recursive: true });
  const line = JSON.stringify({ ...event, time: new Date().toISOString() });
  await fs.appendFile(getRunPath(workspaceRoot, requirementId, runId), `${line}\n`, 'utf8');
}

export async function readRunEvents(workspaceRoot: string, requirementId: string, runId: string): Promise<RunEvent[]> {
  try {
    const content = await fs.readFile(getRunPath(workspaceRoot, requirementId, runId), 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunEvent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
