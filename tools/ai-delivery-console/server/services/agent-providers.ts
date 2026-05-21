import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentProvider, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { serverConfig } from '../config';
import { appendRunEvent } from './run-log';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';

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
      available: Boolean(serverConfig.codexCommand),
      supportsStreaming: true
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
    supportsStreaming: provider.supportsStreaming !== false
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
