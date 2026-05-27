import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentProvider, RequirementWorkflow, RunRecord, RunStatus } from '../../shared/workflow';
import { serverConfig } from '../config';
import { appendRunEvent } from './run-log';
import { assertInsideWorkspace, normalizeRequirementId, toRelativePath } from './workspace';

const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
const cancelledRunIds = new Set<string>();

function splitCommand(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) || [];
}

function defaultProviders(): AgentProvider[] {
  return [
    {
      id: 'codex',
      name: 'Codex',
      description: '使用本机 Codex CLI 执行技能 Prompt。',
      inputMode: 'STDIN',
      command: splitCommand(serverConfig.codexCommand),
      interactiveCommand: splitCommand(serverConfig.codexInteractiveCommand),
      available: Boolean(serverConfig.codexCommand),
      supportsStreaming: true,
      supportsInteractive: Boolean(serverConfig.codexInteractiveCommand)
    }
  ];
}

async function configuredProviders(): Promise<AgentProvider[]> {
  const raw = serverConfig.agentProvidersJson
    ? serverConfig.agentProvidersJson
    : serverConfig.agentProvidersPath
      ? await fs.readFile(serverConfig.agentProvidersPath, 'utf8')
      : '';
  if (!raw) {
    return [];
  }
  const providers = JSON.parse(raw) as AgentProvider[];
  return providers.map((provider) => ({
    ...provider,
    available: provider.available !== false,
    supportsStreaming: provider.supportsStreaming !== false,
    supportsInteractive: provider.supportsInteractive ?? Boolean(provider.interactiveCommand?.length)
  }));
}

export async function listAgentProviders(): Promise<AgentProvider[]> {
  const byId = new Map<string, AgentProvider>();
  for (const provider of [...defaultProviders(), ...(await configuredProviders())]) {
    byId.set(provider.id, provider);
  }
  return [...byId.values()];
}

export async function getAgentProvider(agentId: string): Promise<AgentProvider | undefined> {
  return (await listAgentProviders()).find((provider) => provider.id === agentId);
}

export async function createPromptEnvelope(workspaceRoot: string, workflow: RequirementWorkflow, run: RunRecord, commandText: string): Promise<string> {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const promptDir = path.join(workspaceRoot, 'docs', requirementId, 'workflow', 'prompts');
  await fs.mkdir(promptDir, { recursive: true });
  const promptPath = path.join(promptDir, `${run.id}.md`);
  const skillName = commandText.trim().split(/\s+/)[0]?.replace(/^\//, '') || 'unknown';
  const skillPath = path.join(workspaceRoot, '.codex', 'skills', skillName, 'SKILL.md');
  const relativeSkillPath = path.relative(workspaceRoot, skillPath);
  const content = `# AI Delivery Agent Task

你将在工作区执行一个 AI 需求交付动作。

- 工作区: ${workspaceRoot}
- 需求号: ${workflow.requirementId}
- 需求标题: ${workflow.title}
- 关联分支: ${workflow.branchName || '未绑定'}
- 运行 ID: ${run.id}
- Agent: ${run.agentId || 'unknown'}

## 技能

- 名称: ${skillName}
- 说明文件: ${relativeSkillPath}

## 标准调用

\`\`\`text
${commandText}
\`\`\`

## 执行要求

1. 先阅读技能说明文件，并严格按技能约定执行。
2. 所有文件读写必须限制在工作区内。
3. 关键执行步骤、命令、阻塞原因和产物路径需要输出到终端。
4. 若技能要求生成文档或报告，写入技能约定目录。
5. 如果缺少必要输入或权限，停止并说明最小补充信息。
`;
  await fs.writeFile(promptPath, content, 'utf8');
  return path.relative(workspaceRoot, promptPath);
}

function renderCommand(command: string[], context: Record<string, string>): string[] {
  return command.map((part) => part.replace(/\{(\w+)\}/g, (_, key) => context[key] ?? ''));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function terminalCommandLine(provider: AgentProvider, renderedCommand: string[]): string {
  if (provider.inputMode === 'STDIN' && renderedCommand[renderedCommand.length - 1] === '-') {
    return [...renderedCommand.slice(0, -1).map(shellQuote), '"$(cat "$PROMPT_FILE")"'].join(' ');
  }
  const command = renderedCommand.map(shellQuote).join(' ');
  return provider.inputMode === 'STDIN' ? `${command} < "$PROMPT_FILE"` : command;
}

export function interactiveTerminalCommandLine(renderedCommand: string[]): string {
  return renderedCommand.map(shellQuote).join(' ');
}

function isInteractiveTerminalRun(run: RunRecord): boolean {
  return run.executionMode === 'INTERACTIVE_TERMINAL';
}

function isTerminalExecutionMode(run: RunRecord): boolean {
  return run.executionMode === 'TERMINAL' || run.executionMode === 'INTERACTIVE_TERMINAL';
}

function terminalCommandTemplate(provider: AgentProvider, run: RunRecord): string[] {
  return isInteractiveTerminalRun(run) ? provider.interactiveCommand || [] : provider.command || [];
}

function terminalExecutionModeLabel(run: RunRecord): string {
  return isInteractiveTerminalRun(run) ? '交互终端' : '本地终端';
}

interface TerminalRunScript {
  promptPath: string;
  scriptPath: string;
  statusPath: string;
  transcriptPath: string;
  commandLine: string;
}

export async function createTerminalRunScript(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  provider: AgentProvider,
  commandText: string
): Promise<TerminalRunScript> {
  const promptPath = await createPromptEnvelope(workspaceRoot, workflow, run, commandText);
  const absolutePromptPath = assertInsideWorkspace(workspaceRoot, promptPath);
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const scriptDir = path.join(workspaceRoot, 'docs', requirementId, 'workflow', 'scripts');
  const runDir = path.join(workspaceRoot, 'docs', requirementId, 'workflow', 'runs');
  await fs.mkdir(scriptDir, { recursive: true });
  await fs.mkdir(runDir, { recursive: true });

  const absoluteScriptPath = path.join(scriptDir, `${run.id}.command`);
  const absoluteTranscriptPath = path.join(runDir, `${run.id}.terminal.log`);
  const absoluteStatusPath = path.join(runDir, `${run.id}.terminal-status.json`);
  const promptContent = await fs.readFile(absolutePromptPath, 'utf8');
  const interactiveMode = isInteractiveTerminalRun(run);
  const commandTemplate = terminalCommandTemplate(provider, run);
  if (!commandTemplate.length) {
    throw new Error(`${terminalExecutionModeLabel(run)}未配置可执行命令: ${provider.name}`);
  }
  const rendered = renderCommand(commandTemplate, {
    workspaceRoot,
    promptFile: absolutePromptPath,
    promptPath: absolutePromptPath,
    prompt: promptContent,
    commandText,
    requirementId: workflow.requirementId,
    runId: run.id
  });
  const commandLine = interactiveMode ? interactiveTerminalCommandLine(rendered) : terminalCommandLine(provider, rendered);
  const transcriptPath = toRelativePath(workspaceRoot, absoluteTranscriptPath);
  const statusPath = toRelativePath(workspaceRoot, absoluteStatusPath);
  const executionModeLabel = terminalExecutionModeLabel(run);

  const script = `#!/bin/zsh
emulate -L zsh
setopt pipefail

WORKSPACE_ROOT=${shellQuote(workspaceRoot)}
PROMPT_FILE=${shellQuote(absolutePromptPath)}
TRANSCRIPT_FILE=${shellQuote(absoluteTranscriptPath)}
STATUS_FILE=${shellQuote(absoluteStatusPath)}
RUN_ID=${shellQuote(run.id)}
REQUIREMENT_ID=${shellQuote(workflow.requirementId)}
AGENT_NAME=${shellQuote(provider.name)}
COMMAND_TEXT=${shellQuote(commandText)}
COMMAND_PREVIEW=${shellQuote(commandLine)}
EXECUTION_MODE=${shellQuote(run.executionMode || 'TERMINAL')}
EXECUTION_MODE_LABEL=${shellQuote(executionModeLabel)}

mkdir -p "$(dirname "$TRANSCRIPT_FILE")"
cd "$WORKSPACE_ROOT" || exit 1

printf '{"status":"RUNNING","startedAt":"%s","transcriptPath":"%s"}\\n' "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")" ${shellQuote(transcriptPath)} > "$STATUS_FILE"

if [[ "$EXECUTION_MODE" == "INTERACTIVE_TERMINAL" ]]; then
  {
    print "[AI Delivery] 开始$EXECUTION_MODE_LABEL执行"
    print "[AI Delivery] 需求号: $REQUIREMENT_ID"
    print "[AI Delivery] Run ID: $RUN_ID"
    print "[AI Delivery] Agent: $AGENT_NAME"
    print "[AI Delivery] Prompt: $PROMPT_FILE"
    print "[AI Delivery] 标准调用: $COMMAND_TEXT"
    print "[AI Delivery] 命令: $COMMAND_PREVIEW"
    print ""
  } | tee -a "$TRANSCRIPT_FILE"

  if command -v script >/dev/null 2>&1; then
    script -q -a "$TRANSCRIPT_FILE" zsh -lc "$COMMAND_PREVIEW"
    command_exit=$?
  else
    print "[AI Delivery] 未找到 script 命令，将直接运行交互命令，transcript 可能不完整。" | tee -a "$TRANSCRIPT_FILE"
    zsh -lc "$COMMAND_PREVIEW"
    command_exit=$?
  fi

  {
    print ""
    if (( command_exit == 0 )); then
      terminal_status="SUCCEEDED"
      print "[AI Delivery] Agent 执行完成"
    else
      terminal_status="FAILED"
      print "[AI Delivery] Agent 执行失败，退出码 $command_exit"
    fi

    finished_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
    printf '{"status":"%s","exitCode":%s,"finishedAt":"%s","transcriptPath":"%s"}\\n' "$terminal_status" "$command_exit" "$finished_at" ${shellQuote(transcriptPath)} > "$STATUS_FILE"
    print "[AI Delivery] Transcript: $TRANSCRIPT_FILE"
    print "[AI Delivery] Status: $STATUS_FILE"
  } | tee -a "$TRANSCRIPT_FILE"

  exit $command_exit
fi

{
  print "[AI Delivery] 开始$EXECUTION_MODE_LABEL执行"
  print "[AI Delivery] 需求号: $REQUIREMENT_ID"
  print "[AI Delivery] Run ID: $RUN_ID"
  print "[AI Delivery] Agent: $AGENT_NAME"
  print "[AI Delivery] Prompt: $PROMPT_FILE"
  print "[AI Delivery] 标准调用: $COMMAND_TEXT"
  print "[AI Delivery] 命令: $COMMAND_PREVIEW"
  print ""

  ${commandLine}
  command_exit=$?

  print ""
  if (( command_exit == 0 )); then
    terminal_status="SUCCEEDED"
    print "[AI Delivery] Agent 执行完成"
  else
    terminal_status="FAILED"
    print "[AI Delivery] Agent 执行失败，退出码 $command_exit"
  fi

  finished_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  printf '{"status":"%s","exitCode":%s,"finishedAt":"%s","transcriptPath":"%s"}\\n' "$terminal_status" "$command_exit" "$finished_at" ${shellQuote(transcriptPath)} > "$STATUS_FILE"
  print "[AI Delivery] Transcript: $TRANSCRIPT_FILE"
  print "[AI Delivery] Status: $STATUS_FILE"
  exit $command_exit
} 2>&1 | tee -a "$TRANSCRIPT_FILE"

exit $pipestatus[1]
`;

  await fs.writeFile(absoluteScriptPath, script, { encoding: 'utf8', mode: 0o755 });
  await fs.chmod(absoluteScriptPath, 0o755);

  return {
    promptPath,
    scriptPath: toRelativePath(workspaceRoot, absoluteScriptPath),
    statusPath,
    transcriptPath,
    commandLine
  };
}

async function launchTerminalScript(workspaceRoot: string, absoluteScriptPath: string): Promise<void> {
  if (process.env.AI_DELIVERY_TERMINAL_DRY_RUN === '1') {
    return;
  }
  const rawCommand = process.env.AI_DELIVERY_TERMINAL_COMMAND || 'open -a Terminal {scriptFile}';
  const command = renderCommand(splitCommand(rawCommand), {
    workspaceRoot,
    scriptFile: absoluteScriptPath
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: workspaceRoot,
      shell: false,
      stdio: 'ignore',
      detached: true
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`打开本地终端失败，退出码 ${code}`));
      }
    });
    child.unref();
  });
}

export async function refreshTerminalRunStatuses(
  workspaceRoot: string,
  workflow: RequirementWorkflow
): Promise<{ workflow: RequirementWorkflow; changed: boolean }> {
  let changed = false;
  const finalStatuses = new Set<RunStatus>(['SUCCEEDED', 'FAILED', 'CANCELLED']);
  for (const run of workflow.runs) {
    if (!isTerminalExecutionMode(run) || !run.terminalStatusPath || finalStatuses.has(run.status)) {
      continue;
    }
    const absoluteStatusPath = assertInsideWorkspace(workspaceRoot, run.terminalStatusPath);
    const raw = await fs.readFile(absoluteStatusPath, 'utf8').catch(() => '');
    if (!raw.trim()) {
      continue;
    }
    const status = JSON.parse(raw) as { status?: RunStatus; exitCode?: number; finishedAt?: string; transcriptPath?: string };
    if (!status.status || !finalStatuses.has(status.status)) {
      continue;
    }
    run.status = status.status;
    run.finishedAt = status.finishedAt || new Date().toISOString();
    const terminalLabel = terminalExecutionModeLabel(run);
    run.error = status.status === 'FAILED' ? `${terminalLabel} Agent 退出码: ${status.exitCode ?? 'unknown'}` : undefined;
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: status.status === 'FAILED' ? 'ERROR' : 'EXIT',
      level: status.status === 'FAILED' ? 'ERROR' : 'INFO',
      message: status.status === 'FAILED' ? `${terminalLabel} Agent 执行失败，退出码 ${status.exitCode ?? 'unknown'}` : `${terminalLabel} Agent 执行完成`,
      agentId: run.agentId,
      data: {
        exitCode: status.exitCode,
        transcriptPath: status.transcriptPath || run.terminalTranscriptPath,
        statusPath: run.terminalStatusPath
      }
    });
    changed = true;
  }
  return { workflow, changed };
}

export async function startAgentProcess(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  provider: AgentProvider,
  commandText: string,
  onUpdate: (run: RunRecord) => Promise<void>
): Promise<RunRecord> {
  if (provider.inputMode === 'MANUAL' || !provider.command?.length) {
    run.status = 'WAITING_FOR_AGENT';
    run.commandText = commandText;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'WARN',
      level: 'WARN',
      message: '当前 Agent 为手动模式，请复制标准调用文本执行',
      agentId: provider.id,
      data: { commandText }
    });
    return run;
  }

  if (!provider.available) {
    run.status = 'WAITING_FOR_AGENT';
    run.commandText = commandText;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'WARN',
      level: 'WARN',
      message: `Agent Provider 不可用: ${provider.name}`,
      agentId: provider.id,
      data: { commandText }
    });
    return run;
  }

  const promptPath = await createPromptEnvelope(workspaceRoot, workflow, run, commandText);
  const absolutePromptPath = assertInsideWorkspace(workspaceRoot, promptPath);
  run.promptPath = promptPath;
  run.commandText = commandText;

  const rendered = renderCommand(provider.command, {
    workspaceRoot,
    promptFile: absolutePromptPath,
    promptPath: absolutePromptPath,
    commandText,
    requirementId: workflow.requirementId,
    runId: run.id
  });

  await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
    type: 'START',
    level: 'INFO',
    message: `启动 Agent: ${provider.name}`,
    agentId: provider.id,
    data: { command: rendered, promptPath }
  });

  const child = spawn(rendered[0], rendered.slice(1), {
    cwd: workspaceRoot,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AI_DELIVERY_REQUIREMENT_ID: workflow.requirementId,
      AI_DELIVERY_RUN_ID: run.id
    }
  });

  run.pid = child.pid;
  activeProcesses.set(run.id, child);

  if (provider.inputMode === 'STDIN') {
    const promptContent = await fs.readFile(absolutePromptPath, 'utf8');
    child.stdin.end(promptContent);
  }

  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'STDOUT',
      level: 'INFO',
      message: text.trimEnd() || 'stdout',
      text,
      agentId: provider.id
    }).catch(() => undefined);
  });

  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'STDERR',
      level: 'WARN',
      message: text.trimEnd() || 'stderr',
      text,
      agentId: provider.id
    }).catch(() => undefined);
  });

  child.on('error', (error) => {
    activeProcesses.delete(run.id);
    run.status = 'FAILED';
    run.error = error.message;
    run.finishedAt = new Date().toISOString();
    appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'ERROR',
      level: 'ERROR',
      message: error.message,
      agentId: provider.id
    })
      .then(() => onUpdate(run))
      .catch(() => undefined);
  });

  child.on('close', (code) => {
    activeProcesses.delete(run.id);
    const wasCancelled = cancelledRunIds.has(run.id);
    cancelledRunIds.delete(run.id);
    run.status = wasCancelled ? 'CANCELLED' : code === 0 ? 'SUCCEEDED' : 'FAILED';
    run.error = wasCancelled ? undefined : code === 0 ? undefined : `Agent 退出码: ${code}`;
    run.finishedAt = new Date().toISOString();
    appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: wasCancelled ? 'CANCELLED' : 'EXIT',
      level: wasCancelled ? 'WARN' : code === 0 ? 'INFO' : 'ERROR',
      message: wasCancelled ? 'Agent 运行已取消' : code === 0 ? 'Agent 执行完成' : `Agent 执行失败，退出码 ${code}`,
      agentId: provider.id,
      data: { code }
    })
      .then(() => onUpdate(run))
      .catch(() => undefined);
  });

  const timeout = setTimeout(() => {
    const running = activeProcesses.get(run.id);
    if (running) {
      running.kill();
      activeProcesses.delete(run.id);
      run.status = 'FAILED';
      run.error = `Agent 执行超时 (${serverConfig.agentTimeout}ms)`;
      run.finishedAt = new Date().toISOString();
      appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: 'ERROR',
        level: 'ERROR',
        message: run.error,
        agentId: provider.id
      })
        .then(() => onUpdate(run))
        .catch(() => undefined);
    }
  }, serverConfig.agentTimeout);
  child.on('close', () => clearTimeout(timeout));

  return run;
}

export async function startAgentInTerminal(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  provider: AgentProvider,
  commandText: string
): Promise<RunRecord> {
  const requestedMode = isInteractiveTerminalRun(run) ? 'INTERACTIVE_TERMINAL' : 'TERMINAL';
  run.executionMode = requestedMode;
  const commandTemplate = terminalCommandTemplate(provider, run);

  if (provider.inputMode === 'MANUAL' || !commandTemplate.length) {
    run.status = 'WAITING_FOR_AGENT';
    run.commandText = commandText;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'WARN',
      level: 'WARN',
      message:
        provider.inputMode === 'MANUAL'
          ? '当前 Agent 为手动模式，请复制标准调用文本执行'
          : `${terminalExecutionModeLabel(run)}未配置可执行命令: ${provider.name}`,
      agentId: provider.id,
      data: { commandText }
    });
    return run;
  }

  if (!provider.available) {
    run.status = 'WAITING_FOR_AGENT';
    run.commandText = commandText;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'WARN',
      level: 'WARN',
      message: `Agent Provider 不可用: ${provider.name}`,
      agentId: provider.id,
      data: { commandText }
    });
    return run;
  }

  run.commandText = commandText;
  const terminal = await createTerminalRunScript(workspaceRoot, workflow, run, provider, commandText);
  run.promptPath = terminal.promptPath;
  run.terminalScriptPath = terminal.scriptPath;
  run.terminalTranscriptPath = terminal.transcriptPath;
  run.terminalStatusPath = terminal.statusPath;

  await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
    type: 'START',
    level: 'INFO',
    message: `准备在本地终端启动 Agent: ${provider.name}`,
    agentId: provider.id,
    data: {
      promptPath: terminal.promptPath,
      scriptPath: terminal.scriptPath,
      transcriptPath: terminal.transcriptPath,
      statusPath: terminal.statusPath,
      commandLine: terminal.commandLine
    }
  });

  try {
    await launchTerminalScript(workspaceRoot, assertInsideWorkspace(workspaceRoot, terminal.scriptPath));
    run.status = 'TERMINAL_OPENED';
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'INFO',
      level: 'INFO',
      message:
        process.env.AI_DELIVERY_TERMINAL_DRY_RUN === '1'
          ? '已生成终端脚本，当前为 dry-run 未打开终端'
          : '已打开本地终端，后续交互请在终端中完成',
      agentId: provider.id,
      data: {
        scriptPath: terminal.scriptPath,
        transcriptPath: terminal.transcriptPath,
        statusPath: terminal.statusPath
      }
    });
  } catch (error: any) {
    run.status = 'FAILED';
    run.error = error.message;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'ERROR',
      level: 'ERROR',
      message: error.message,
      agentId: provider.id
    });
  }

  return run;
}

export async function cancelAgentRun(workspaceRoot: string, requirementId: string, runId: string): Promise<boolean> {
  const child = activeProcesses.get(runId);
  if (!child) {
    return false;
  }
  child.kill();
  activeProcesses.delete(runId);
  cancelledRunIds.add(runId);
  await appendRunEvent(workspaceRoot, requirementId, runId, {
    type: 'CANCELLED',
    level: 'WARN',
    message: '用户取消运行'
  });
  return true;
}
