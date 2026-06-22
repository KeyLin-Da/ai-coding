import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentProvider, RequirementWorkflow, RunRecord, RunStatus } from '../../shared/workflow';
import { serverConfig } from '../config';
import { appendRunEvent } from './run-log';
import { normalizeRequirementId } from './workspace';
import { normalizeProjectBasePaths, resolveWorkflowProjects } from './project-resolver';
import { getPromptRuntimeDir, getRunRuntimeDir, getRunnerRuntimeRoot, getScriptRuntimeDir, resolveWorkspaceOrRuntimePath, toRuntimePathRef } from './runtime-paths';
import { CodexUsageNdjsonParser, type CodexUsageEvent } from './codex-usage-parser';
import { uploadCenterRunTokenUsage, type CenterRunnerConfig } from './center-runner-adapter';

const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
const cancelledRunIds = new Set<string>();

type CommandContext = Record<string, string | string[]>;

function splitCommand(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) || [];
}

function isCliAvailable(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getAgentSkillDir(agentId: string): string {
  const mapping: Record<string, string> = {
    codex: '.codex',
    codebuddy: '.codebuddy',
    qoder: '.qoder',
    qwen: '.qwen'
  };
  return mapping[agentId] || '.codex';
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
    },
    {
      id: 'codebuddy',
      name: 'CodeBuddy',
      description: '使用本机 CodeBuddy CLI 执行技能 Prompt。',
      inputMode: 'STDIN',
      command: splitCommand(serverConfig.codebuddyCommand),
      interactiveCommand: splitCommand(serverConfig.codebuddyInteractiveCommand),
      available: isCliAvailable('codebuddy'),
      supportsStreaming: true,
      supportsInteractive: Boolean(serverConfig.codebuddyInteractiveCommand)
    },
    {
      id: 'qoder',
      name: 'Qoder',
      description: '使用本机 qcode CLI 执行技能 Prompt。',
      inputMode: 'STDIN',
      command: splitCommand(serverConfig.qoderCommand),
      interactiveCommand: splitCommand(serverConfig.qoderInteractiveCommand),
      available: isCliAvailable('qcode'),
      supportsStreaming: false,
      supportsInteractive: Boolean(serverConfig.qoderInteractiveCommand)
    },
    {
      id: 'qwen',
      name: 'Qwen',
      description: '使用本机 Qwen CLI 执行技能 Prompt。',
      inputMode: 'STDIN',
      command: splitCommand(serverConfig.qwenCommand),
      interactiveCommand: splitCommand(serverConfig.qwenInteractiveCommand),
      available: isCliAvailable('qwen'),
      supportsStreaming: false,
      supportsInteractive: Boolean(serverConfig.qwenInteractiveCommand)
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

async function selectedProjectRoots(workspaceRoot: string, workflow: RequirementWorkflow, projectPaths: string[] = []): Promise<string[]> {
  if (!workflow.projects?.length) {
    return [];
  }
  const resolved = await resolveWorkflowProjects(workspaceRoot, workflow.projects, projectPaths);
  return resolved.map((item) => item.rootPath);
}

function projectAddDirArgs(projectRoots: string[]): string[] {
  return projectRoots.flatMap((projectRoot) => ['--add-dir', projectRoot]);
}

function agentReadableProjectRoots(workspaceRoot: string, projectRoots: string[]): string[] {
  return [...projectRoots, getRunnerRuntimeRoot(workspaceRoot)];
}

function projectParentAddDirArgs(projectPaths: string[] = []): string[] {
  return normalizeProjectBasePaths(projectPaths).flatMap((projectPath) => ['--add-dir', projectPath]);
}

export async function createPromptEnvelope(workspaceRoot: string, workflow: RequirementWorkflow, run: RunRecord, commandText: string, projectPaths?: string[]): Promise<string> {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const promptDir = getPromptRuntimeDir(workspaceRoot, requirementId);
  await fs.mkdir(promptDir, { recursive: true });
  const promptPath = path.join(promptDir, `${run.id}.md`);
  const skillName = commandText.trim().split(/\s+/)[0]?.replace(/^\//, '') || 'unknown';
  const agentSkillDir = getAgentSkillDir(run.agentId || 'codex');
  const skillPath = path.join(workspaceRoot, agentSkillDir, 'skills', skillName, 'SKILL.md');
  const relativeSkillPath = path.relative(workspaceRoot, skillPath);
  const projectRoots = await selectedProjectRoots(workspaceRoot, workflow, projectPaths);
  const configuredProjectPaths = projectPaths?.length ? `\n### 已配置工程父目录\n\n${projectPaths.map((p) => `- ${p}`).join('\n')}\n` : '';
  const selectedProjects = projectRoots.length ? `\n### 本次涉及工程\n\n${projectRoots.map((p) => `- ${p}`).join('\n')}\n` : '';
  const projectPathsSection = configuredProjectPaths || selectedProjects
    ? `\n## 工程代码目录\n${configuredProjectPaths}${selectedProjects}`
    : '';
  const projectDiscoverySection = projectPathsSection
    ? `
## 工程检索策略

- “本次涉及工程”是优先搜索工程，不是完整只读检索边界。
- 先在本次涉及工程中定位入口和主要实现；如发现 Feign、API 包、DTO、表名、MQ Topic、Redis Key、路由、配置 Key、import 等跨工程线索，可在已配置工程父目录内只读扩展检索。
- 技术方案或答疑产物需要声明代码检索范围：优先工程、自动扩展工程、扩展依据、未检索工程及原因。
- 自动扩展工程仅允许只读分析；需要修改时，必须明确建议用户追加为涉及工程并等待确认。
`
    : '';
  const content = `# AI Delivery Agent Task

你将在工作区执行一个 AI 需求交付动作。

- 交付工作区: ${workspaceRoot}
- 需求号: ${workflow.requirementId}
- 需求标题: ${workflow.title}
- 关联分支: ${workflow.branchName || '未绑定'}
- 运行 ID: ${run.id}
- Agent: ${run.agentId || 'unknown'}
${projectPathsSection}${projectDiscoverySection}
## 技能

- 名称: ${skillName}
- 说明文件: ${relativeSkillPath}

## 标准调用

\`\`\`text
${commandText}
\`\`\`

## 执行要求

1. 先阅读技能说明文件，并严格按技能约定执行。
2. 交付产物、OpenSpec 工件、运行日志和报告必须写入交付工作区内的约定目录。
3. 工程代码读取遵守上方工程目录和检索策略；工程代码修改仅限本次涉及工程或用户明确确认的工程；不要把工程产物写入交付工作区之外的其他位置。
4. 关键执行步骤、命令、阻塞原因和产物路径需要输出到终端。
5. 若技能要求生成文档或报告，写入技能约定目录。
6. 如果缺少必要输入或权限，停止并说明最小补充信息。
`;
  await fs.writeFile(promptPath, content, 'utf8');
  return toRuntimePathRef(workspaceRoot, promptPath);
}

function renderCommand(command: string[], context: CommandContext): string[] {
  return command.flatMap((part) => {
    const exact = part.match(/^\{(\w+)\}$/);
    if (exact) {
      const exactValue = context[exact[1]];
      return Array.isArray(exactValue) ? exactValue : [String(exactValue ?? '')];
    }
    return [
      part.replace(/\{(\w+)\}/g, (_, key) => {
        const value = context[key];
        return Array.isArray(value) ? value.join(' ') : String(value ?? '');
      })
    ];
  }).filter((part) => part !== '');
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
  commandText: string,
  projectPaths?: string[]
): Promise<TerminalRunScript> {
  const promptPath = await createPromptEnvelope(workspaceRoot, workflow, run, commandText, projectPaths);
  const absolutePromptPath = resolveWorkspaceOrRuntimePath(workspaceRoot, promptPath);
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const scriptDir = getScriptRuntimeDir(workspaceRoot, requirementId);
  const runDir = getRunRuntimeDir(workspaceRoot, requirementId);
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
  const projectRoots = agentReadableProjectRoots(workspaceRoot, await selectedProjectRoots(workspaceRoot, workflow, projectPaths));
  const rendered = renderCommand(commandTemplate, {
    workspaceRoot,
    promptFile: absolutePromptPath,
    promptPath: absolutePromptPath,
    prompt: promptContent,
    commandText,
    requirementId: workflow.requirementId,
    runId: run.id,
    projectAddDirArgs: projectAddDirArgs(projectRoots),
    projectParentAddDirArgs: projectParentAddDirArgs(projectPaths)
  });
  const commandLine = interactiveMode ? interactiveTerminalCommandLine(rendered) : terminalCommandLine(provider, rendered);
  const transcriptPath = toRuntimePathRef(workspaceRoot, absoluteTranscriptPath);
  const statusPath = toRuntimePathRef(workspaceRoot, absoluteStatusPath);
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
    script -q -a "$TRANSCRIPT_FILE" zsh -lc "setopt pipefail; $COMMAND_PREVIEW"
    command_exit=$?
  else
    print "[AI Delivery] 未找到 script 命令，将直接运行交互命令，transcript 可能不完整。" | tee -a "$TRANSCRIPT_FILE"
    zsh -lc "setopt pipefail; $COMMAND_PREVIEW"
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
    scriptPath: toRuntimePathRef(workspaceRoot, absoluteScriptPath),
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
    const absoluteStatusPath = resolveWorkspaceOrRuntimePath(workspaceRoot, run.terminalStatusPath);
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
  onUpdate: (run: RunRecord) => Promise<void>,
  projectPaths?: string[],
  centerConfig?: CenterRunnerConfig
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

  const promptPath = await createPromptEnvelope(workspaceRoot, workflow, run, commandText, projectPaths);
  const absolutePromptPath = resolveWorkspaceOrRuntimePath(workspaceRoot, promptPath);
  run.promptPath = promptPath;
  run.commandText = commandText;

  const promptContent = await fs.readFile(absolutePromptPath, 'utf8');
  const projectRoots = agentReadableProjectRoots(workspaceRoot, await selectedProjectRoots(workspaceRoot, workflow, projectPaths));
  const rendered = renderCommand(provider.command, {
    workspaceRoot,
    promptFile: absolutePromptPath,
    promptPath: absolutePromptPath,
    prompt: promptContent,
    commandText,
    requirementId: workflow.requirementId,
    runId: run.id,
    projectAddDirArgs: projectAddDirArgs(projectRoots),
    projectParentAddDirArgs: projectParentAddDirArgs(projectPaths)
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
    child.stdin.end(promptContent);
  } else {
    child.stdin.end();
  }

  const codexUsageParser = provider.id === 'codex' ? new CodexUsageNdjsonParser() : undefined;
  const usageTasks = new Set<Promise<void>>();

  const recordCodexUsageEvents = async (events: CodexUsageEvent[]) => {
    for (const event of events) {
      const usageFingerprint = buildTokenUsageFingerprint(run.id, event);
      const centerRunId = parseCenterRunId(run.id);
      const uploadState = centerRunId ? 'PENDING' : 'SKIPPED_LOCAL_RUN_ID';
      await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: 'INFO',
        level: 'INFO',
        message: `Token usage: total ${event.usage.totalTokens}, input ${event.usage.inputTokens}, output ${event.usage.outputTokens}`,
        text: event.rawEventJson,
        agentId: provider.id,
        data: {
          kind: 'TOKEN_USAGE',
          sourceEventType: event.sourceEventType,
          model: event.model,
          usageFingerprint,
          centerUpload: uploadState,
          usage: event.usage
        }
      });
      if (!centerRunId) {
        continue;
      }
      if (!centerConfig?.centerBaseUrl) {
        await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
          type: 'WARN',
          level: 'WARN',
          message: 'Token usage 已记录本地日志，跳过 Center 上报：缺少中心服务配置',
          agentId: provider.id,
          data: { kind: 'TOKEN_USAGE_UPLOAD_SKIPPED', reason: 'MISSING_CENTER_CONFIG' }
        });
        continue;
      }
      try {
        await uploadCenterRunTokenUsage(centerConfig, {
          runId: centerRunId,
          seq: event.seq,
          stage: run.stage,
          implementationStep: run.implementationStep,
          agentId: provider.id,
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
          occurredAt: new Date().toISOString()
        });
      } catch (error: any) {
        await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
          type: 'WARN',
          level: 'WARN',
          message: `Token usage Center 上报失败：${error?.message || 'unknown error'}`,
          agentId: provider.id,
          data: { kind: 'TOKEN_USAGE_UPLOAD_FAILED', usageFingerprint }
        });
      }
    }
  };

  const enqueueCodexUsageEvents = (events: CodexUsageEvent[]) => {
    if (!events.length) {
      return;
    }
    const task = recordCodexUsageEvents(events).catch(() => undefined);
    usageTasks.add(task);
    task.finally(() => usageTasks.delete(task)).catch(() => undefined);
  };

  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
      type: 'STDOUT',
      level: 'INFO',
      message: text.trimEnd() || 'stdout',
      text,
      agentId: provider.id
    }).catch(() => undefined);
    const usageEvents = codexUsageParser?.push(text) || [];
    enqueueCodexUsageEvents(usageEvents);
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
    (async () => {
      activeProcesses.delete(run.id);
      enqueueCodexUsageEvents(codexUsageParser?.flush() || []);
      await Promise.allSettled([...usageTasks]);
      const wasCancelled = cancelledRunIds.has(run.id);
      cancelledRunIds.delete(run.id);
      run.status = wasCancelled ? 'CANCELLED' : code === 0 ? 'SUCCEEDED' : 'FAILED';
      run.error = wasCancelled ? undefined : code === 0 ? undefined : `Agent 退出码: ${code}`;
      run.finishedAt = new Date().toISOString();
      await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: wasCancelled ? 'CANCELLED' : 'EXIT',
        level: wasCancelled ? 'WARN' : code === 0 ? 'INFO' : 'ERROR',
        message: wasCancelled ? 'Agent 运行已取消' : code === 0 ? 'Agent 执行完成' : `Agent 执行失败，退出码 ${code}`,
        agentId: provider.id,
        data: { code }
      });
      await onUpdate(run);
    })().catch(() => undefined);
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

function parseCenterRunId(runId: string): number | undefined {
  if (!/^\d+$/.test(runId)) {
    return undefined;
  }
  const numeric = Number(runId);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function buildTokenUsageFingerprint(runId: string, event: CodexUsageEvent): string {
  const seed = event.eventId
    ? `${runId}|${event.eventId}`
    : `${runId}|${event.seq}|${event.rawUsageJson}`;
  return createHash('sha256').update(seed).digest('hex');
}

export async function startAgentInTerminal(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  provider: AgentProvider,
  commandText: string,
  projectPaths?: string[]
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
  const terminal = await createTerminalRunScript(workspaceRoot, workflow, run, provider, commandText, projectPaths);
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
    await launchTerminalScript(workspaceRoot, resolveWorkspaceOrRuntimePath(workspaceRoot, terminal.scriptPath));
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
