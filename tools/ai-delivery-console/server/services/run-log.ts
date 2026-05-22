import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunEvent, WorkflowStage } from '../../shared/workflow';
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

// 为每个流程阶段获取独立的日志目录
export function getStageLogDir(workspaceRoot: string, requirementId: string, stage: WorkflowStage): string {
  const stageMap: Record<WorkflowStage, string> = {
    PRD: 'prd',
    TECH_DESIGN: 'tech-design',
    IMPLEMENTATION: 'implementation',
    CODE_REVIEW: 'code-review'
  };
  return path.join(workspaceRoot, 'docs', normalizeRequirementId(requirementId), 'workflow', 'logs', stageMap[stage]);
}

// 为每个流程阶段获取独立的日志文件路径
export function getStageLogPath(workspaceRoot: string, requirementId: string, stage: WorkflowStage): string {
  return path.join(getStageLogDir(workspaceRoot, requirementId, stage), 'command.log');
}

export async function appendRunEvent(workspaceRoot: string, requirementId: string, runId: string, event: Omit<RunEvent, 'time'>): Promise<void> {
  await fs.mkdir(getRunDir(workspaceRoot, requirementId), { recursive: true });
  const line = JSON.stringify({ ...event, time: new Date().toISOString() });
  await fs.appendFile(getRunPath(workspaceRoot, requirementId, runId), `${line}\n`, 'utf8');
}

// 为每个流程阶段追加命令日志
export async function appendStageCommandLog(
  workspaceRoot: string,
  requirementId: string,
  stage: WorkflowStage,
  command: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const logDir = getStageLogDir(workspaceRoot, requirementId, stage);
  await fs.mkdir(logDir, { recursive: true });
  const logPath = getStageLogPath(workspaceRoot, requirementId, stage);

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    command,
    ...(metadata || {})
  };

  await fs.appendFile(logPath, `${JSON.stringify(logEntry)}\n`, 'utf8');
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
