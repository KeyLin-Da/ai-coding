import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunEvent, WorkflowStage } from '../../shared/workflow';
import { assertInsideWorkspace, createId, normalizeRequirementId } from './workspace';

const TERMINAL_TRANSCRIPT_MAX_BYTES = 256 * 1024;

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

export async function readTerminalTranscriptSize(workspaceRoot: string, transcriptPath?: string): Promise<number> {
  if (!transcriptPath) {
    return 0;
  }
  try {
    const stat = await fs.stat(assertInsideWorkspace(workspaceRoot, transcriptPath));
    return stat.isFile() ? stat.size : 0;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

export async function readTerminalTranscriptChunk(
  workspaceRoot: string,
  transcriptPath: string | undefined,
  offset = 0,
  maxBytes = TERMINAL_TRANSCRIPT_MAX_BYTES
): Promise<{ event?: RunEvent; nextOffset: number }> {
  if (!transcriptPath) {
    return { nextOffset: offset };
  }

  try {
    const absoluteTranscriptPath = assertInsideWorkspace(workspaceRoot, transcriptPath);
    const stat = await fs.stat(absoluteTranscriptPath);
    if (!stat.isFile()) {
      return { nextOffset: offset };
    }

    const safeOffset = offset > stat.size ? 0 : Math.max(0, offset);
    const availableBytes = stat.size - safeOffset;
    if (availableBytes <= 0) {
      return { nextOffset: stat.size };
    }

    const readStart = availableBytes > maxBytes ? stat.size - maxBytes : safeOffset;
    const readLength = stat.size - readStart;
    const buffer = Buffer.alloc(readLength);
    const file = await fs.open(absoluteTranscriptPath, 'r');
    try {
      const result = await file.read(buffer, 0, readLength, readStart);
      const text = buffer.subarray(0, result.bytesRead).toString('utf8');
      const prefix = readStart > safeOffset ? `[AI Delivery] Transcript 过长，仅显示最新 ${maxBytes} bytes。\n` : '';
      return {
        nextOffset: stat.size,
        event: {
          time: stat.mtime.toISOString(),
          type: 'STDOUT',
          level: 'INFO',
          message: '终端 transcript',
          text: prefix + text,
          data: {
            transcriptPath,
            offset: readStart,
            bytesRead: result.bytesRead,
            truncated: readStart > safeOffset
          }
        }
      };
    } finally {
      await file.close();
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { nextOffset: offset };
    }
    throw error;
  }
}

export async function readRunEventsWithTranscript(
  workspaceRoot: string,
  requirementId: string,
  runId: string,
  transcriptPath?: string
): Promise<RunEvent[]> {
  const events = await readRunEvents(workspaceRoot, requirementId, runId);
  const transcript = await readTerminalTranscriptChunk(workspaceRoot, transcriptPath, 0);
  return transcript.event ? [...events, transcript.event] : events;
}
