import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AgentProvider, RequirementWorkflow, RunRecord, RunStatus } from '../../shared/workflow';
import { appendRunEvent, stripTerminalControlSequences } from './run-log';
import { getRunRuntimeDir, toRuntimePathRef } from './runtime-paths';

const require = createRequire(import.meta.url);
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const TERMINAL_KILL_GRACE_MS = 1500;
const TRANSCRIPT_REPLAY_MAX_BYTES = 256 * 1024;
const WS_OPEN = 1;

type PtyProcess = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (event: { exitCode: number; signal?: number }) => void): void;
};

type PtyModule = {
  spawn(command: string, args: string[], options: Record<string, unknown>): PtyProcess;
};

export interface EmbeddedTerminalStartInput {
  workspaceRoot: string;
  workflow: RequirementWorkflow;
  run: RunRecord;
  provider: AgentProvider;
  commandText: string;
  promptPath: string;
  renderedCommand: string[];
}

interface EmbeddedTerminalSession {
  runId: string;
  requirementId: string;
  workspaceRoot: string;
  pty: PtyProcess;
  transcriptPath: string;
  rawTranscriptPath: string;
  statusPath: string;
  sockets: Set<TerminalSocket>;
  status: RunStatus;
  cancelled: boolean;
}

type TerminalSocket = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, callback: (...args: any[]) => void): void;
};

const activeTerminalSessions = new Map<string, EmbeddedTerminalSession>();

function loadPty(): PtyModule {
  try {
    return require('node-pty') as PtyModule;
  } catch (error: any) {
    throw new Error(`内嵌终端依赖 node-pty 不可用，请先安装依赖或切换外部终端：${error?.message || 'module not found'}`);
  }
}

function loadWs(): { WebSocketServer: new (options: Record<string, unknown>) => any; WebSocket: { OPEN: number } } {
  try {
    return require('ws') as { WebSocketServer: new (options: Record<string, unknown>) => any; WebSocket: { OPEN: number } };
  } catch (error: any) {
    throw new Error(`内嵌终端依赖 ws 不可用，请先安装依赖或切换外部终端：${error?.message || 'module not found'}`);
  }
}

function terminalPaths(workspaceRoot: string, requirementId: string, runId: string) {
  const runDir = getRunRuntimeDir(workspaceRoot, requirementId);
  return {
    runDir,
    transcriptPath: path.join(runDir, `${runId}.terminal.log`),
    rawTranscriptPath: path.join(runDir, `${runId}.terminal.ansi`),
    statusPath: path.join(runDir, `${runId}.terminal-status.json`)
  };
}

async function writeTerminalStatus(
  absoluteStatusPath: string,
  workspaceRoot: string,
  input: { status: RunStatus; exitCode?: number; transcriptPath: string; rawTranscriptPath: string; finishedAt?: string }
) {
  const payload = {
    status: input.status,
    exitCode: input.exitCode,
    finishedAt: input.finishedAt,
    transcriptPath: toRuntimePathRef(workspaceRoot, input.transcriptPath),
    rawTranscriptPath: toRuntimePathRef(workspaceRoot, input.rawTranscriptPath)
  };
  await fs.writeFile(absoluteStatusPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function sendJson(socket: TerminalSocket, value: Record<string, unknown>) {
  if (socket.readyState === WS_OPEN) {
    socket.send(JSON.stringify(value));
  }
}

function broadcast(session: EmbeddedTerminalSession, value: Record<string, unknown>) {
  for (const socket of session.sockets) {
    sendJson(socket, value);
  }
}

async function appendOutput(session: EmbeddedTerminalSession, data: string) {
  await fs.appendFile(session.rawTranscriptPath, data, 'utf8');
  await fs.appendFile(session.transcriptPath, stripTerminalControlSequences(data), 'utf8');
}

async function appendTranscriptFiles(transcriptPath: string, rawTranscriptPath: string, data: string) {
  await fs.appendFile(rawTranscriptPath, data, 'utf8');
  await fs.appendFile(transcriptPath, stripTerminalControlSequences(data), 'utf8');
}

async function readRecentFile(filePath: string, maxBytes = TRANSCRIPT_REPLAY_MAX_BYTES): Promise<{ text: string; truncated: boolean }> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    return { text: '', truncated: false };
  }
  const start = stat.size > maxBytes ? stat.size - maxBytes : 0;
  const length = stat.size - start;
  const buffer = Buffer.alloc(length);
  const file = await fs.open(filePath, 'r');
  try {
    const result = await file.read(buffer, 0, length, start);
    return {
      text: buffer.subarray(0, result.bytesRead).toString('utf8'),
      truncated: start > 0
    };
  } finally {
    await file.close();
  }
}

export async function startEmbeddedTerminalSession(input: EmbeddedTerminalStartInput): Promise<RunRecord> {
  const pty = loadPty();
  const { workspaceRoot, workflow, run, provider, renderedCommand } = input;
  if (!renderedCommand.length) {
    throw new Error(`内嵌终端未配置可执行命令: ${provider.name}`);
  }
  const paths = terminalPaths(workspaceRoot, workflow.requirementId, run.id);
  await fs.mkdir(paths.runDir, { recursive: true });
  await fs.writeFile(paths.transcriptPath, '', 'utf8');
  await fs.writeFile(paths.rawTranscriptPath, '', 'utf8');
  const transcriptRef = toRuntimePathRef(workspaceRoot, paths.transcriptPath);
  const rawTranscriptRef = toRuntimePathRef(workspaceRoot, paths.rawTranscriptPath);
  const statusRef = toRuntimePathRef(workspaceRoot, paths.statusPath);
  await writeTerminalStatus(paths.statusPath, workspaceRoot, {
    status: 'RUNNING',
    transcriptPath: paths.transcriptPath,
    rawTranscriptPath: paths.rawTranscriptPath
  });
  const header = [
    '[AI Delivery] 开始内嵌终端执行',
    `[AI Delivery] 需求号: ${workflow.requirementId}`,
    `[AI Delivery] Run ID: ${run.id}`,
    `[AI Delivery] Agent: ${provider.name}`,
    `[AI Delivery] Prompt: ${input.promptPath}`,
    `[AI Delivery] 标准调用: ${input.commandText}`,
    `[AI Delivery] 命令: ${renderedCommand.join(' ')}`,
    ''
  ].join('\n');
  await appendTranscriptFiles(paths.transcriptPath, paths.rawTranscriptPath, `${header}\n`);

  const child = pty.spawn(renderedCommand[0], renderedCommand.slice(1), {
    name: 'xterm-256color',
    cols: run.terminalCols || DEFAULT_COLS,
    rows: run.terminalRows || DEFAULT_ROWS,
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      AI_DELIVERY_RUN_ID: run.id,
      AI_DELIVERY_REQUIREMENT_ID: workflow.requirementId
    }
  });

  const session: EmbeddedTerminalSession = {
    runId: run.id,
    requirementId: workflow.requirementId,
    workspaceRoot,
    pty: child,
    transcriptPath: paths.transcriptPath,
    rawTranscriptPath: paths.rawTranscriptPath,
    statusPath: paths.statusPath,
    sockets: new Set(),
    status: 'RUNNING',
    cancelled: false
  };
  activeTerminalSessions.set(run.id, session);

  run.status = 'RUNNING';
  run.pid = child.pid;
  run.commandText = input.commandText;
  run.promptPath = input.promptPath;
  run.terminalTranscriptPath = transcriptRef;
  run.terminalRawTranscriptPath = rawTranscriptRef;
  run.terminalStatusPath = statusRef;
  run.terminalSessionId = run.id;
  run.terminalSessionStatus = 'DISCONNECTED';

  await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
    type: 'START',
    level: 'INFO',
    message: `已启动内嵌终端 Agent: ${provider.name}`,
    agentId: provider.id,
    data: {
      promptPath: input.promptPath,
      transcriptPath: transcriptRef,
      rawTranscriptPath: rawTranscriptRef,
      statusPath: statusRef,
      pid: child.pid
    }
  });

  child.onData((data) => {
    appendOutput(session, data).catch(() => undefined);
    broadcast(session, { type: 'output', data });
  });
  child.onExit((event) => {
    const status: RunStatus = session.cancelled ? 'CANCELLED' : event.exitCode === 0 ? 'SUCCEEDED' : 'FAILED';
    const finishedAt = new Date().toISOString();
    session.status = status;
    run.status = status;
    run.finishedAt = finishedAt;
    run.error = status === 'FAILED' ? `内嵌终端 Agent 退出码: ${event.exitCode}` : undefined;
    run.terminalSessionStatus = status === 'CANCELLED' ? 'DISCONNECTED' : 'READONLY';
    activeTerminalSessions.delete(run.id);
    writeTerminalStatus(paths.statusPath, workspaceRoot, {
      status,
      exitCode: event.exitCode,
      transcriptPath: paths.transcriptPath,
      rawTranscriptPath: paths.rawTranscriptPath,
      finishedAt
    }).catch(() => undefined);
    appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: status === 'CANCELLED' ? 'CANCELLED' : status === 'SUCCEEDED' ? 'EXIT' : 'ERROR',
      level: status === 'CANCELLED' ? 'WARN' : status === 'SUCCEEDED' ? 'INFO' : 'ERROR',
      message:
        status === 'CANCELLED'
          ? '内嵌终端 Agent 运行已取消'
          : status === 'SUCCEEDED'
            ? '内嵌终端 Agent 执行完成'
            : `内嵌终端 Agent 执行失败，退出码 ${event.exitCode}`,
      agentId: provider.id,
      data: {
        exitCode: event.exitCode,
        signal: event.signal,
        transcriptPath: transcriptRef,
        rawTranscriptPath: rawTranscriptRef
      }
    }).catch(() => undefined);
    broadcast(session, { type: 'exit', status, exitCode: event.exitCode, signal: event.signal });
    for (const socket of session.sockets) {
      socket.close(1000, 'terminal exited');
    }
  });

  return run;
}

export function cancelEmbeddedTerminalRun(runId: string): boolean {
  const session = activeTerminalSessions.get(runId);
  if (!session) {
    return false;
  }
  session.status = 'CANCELLED';
  session.cancelled = true;
  try {
    session.pty.kill('SIGTERM');
  } catch {
    // PTY 可能已退出，状态会由 onExit 或后续刷新收口。
  }
  setTimeout(() => {
    if (activeTerminalSessions.has(runId)) {
      try {
        session.pty.kill('SIGKILL');
      } catch {
        // 同上。
      }
    }
  }, TERMINAL_KILL_GRACE_MS);
  broadcast(session, { type: 'status', status: 'CANCELLED' });
  return true;
}

export function hasEmbeddedTerminalSession(runId: string): boolean {
  return activeTerminalSessions.has(runId);
}

export function createEmbeddedTerminalUpgradeHandler(workspaceRoot: string) {
  const { WebSocketServer, WebSocket } = loadWs();
  const server = new WebSocketServer({ noServer: true });
  server.on('connection', (socket: TerminalSocket, request: { url?: string }) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const runId = decodeURIComponent(url.pathname.match(/(?:\/runner-api)?\/api\/ai-delivery\/runs\/([^/]+)\/terminal$/)?.[1] || '');
    const session = activeTerminalSessions.get(runId);
    if (!session) {
      socket.send(JSON.stringify({ type: 'error', message: 'terminal session not found', workspaceRoot }));
      socket.close(1008, 'terminal session not found');
      return;
    }
    session.sockets.add(socket);
    socket.send(JSON.stringify({ type: 'status', status: 'CONNECTED' }));
    socket.send(JSON.stringify({ type: 'status', status: session.status }));
    readRecentFile(session.rawTranscriptPath)
      .then((replay) => {
        if (replay.text) {
          sendJson(socket, { type: 'output', data: replay.text, replay: true, truncated: replay.truncated });
        }
      })
      .catch(() => undefined);
    socket.on('message', (raw: Buffer | string) => {
      let message: Record<string, any>;
      try {
        message = JSON.parse(String(raw)) as Record<string, any>;
      } catch {
        sendJson(socket, { type: 'error', message: 'invalid terminal message' });
        return;
      }
      if (message.type === 'input' && typeof message.data === 'string') {
        session.pty.write(message.data);
      } else if (message.type === 'resize') {
        const cols = Math.max(20, Math.min(300, Number(message.cols || DEFAULT_COLS)));
        const rows = Math.max(6, Math.min(120, Number(message.rows || DEFAULT_ROWS)));
        session.pty.resize(cols, rows);
      } else if (message.type === 'signal' && message.signal === 'SIGINT') {
        session.pty.write('\x03');
      } else {
        sendJson(socket, { type: 'error', message: 'unsupported terminal message' });
      }
    });
    socket.on('close', () => {
      session.sockets.delete(socket);
    });
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ready' }));
    }
  });
  return server;
}
