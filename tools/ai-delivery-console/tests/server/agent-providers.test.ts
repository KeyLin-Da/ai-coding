import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentProvider, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  cancelAgentRun,
  createPromptEnvelope,
  createTerminalRunScript,
  interactiveTerminalCommandLine,
  listAgentProviders,
  refreshTerminalRunStatuses,
  startAgentProcess,
  terminalCommandLine
} from '../../server/services/agent-providers';
import { readRunEvents } from '../../server/services/run-log';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    branchName: 'feature/opp-172014',
    sources: [],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

function runRecord(id: string): RunRecord {
  return {
    id,
    requirementId: '172014',
    actionType: 'PRD_ANALYZE',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    params: {},
    agentId: 'test-agent'
  };
}

describe('agent-providers', () => {
  it('默认提供 codex Provider', async () => {
    const providers = await listAgentProviders();
    expect(providers.map((provider) => provider.id)).toEqual(expect.arrayContaining(['codex']));
    const codex = providers.find((provider) => provider.id === 'codex');
    expect(codex?.inputMode).toBe('STDIN');
    expect(codex?.command).toEqual(['codex', 'exec', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '-']);
    expect(codex?.interactiveCommand).toEqual(['codex', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '--no-alt-screen', '{prompt}']);
    expect(codex?.supportsInteractive).toBe(true);
    const codebuddy = providers.find((provider) => provider.id === 'codebuddy');
    expect(codebuddy?.inputMode).toBe('STDIN');
    expect(codebuddy?.command).toEqual([
      'codebuddy',
      '--add-dir',
      '{workspaceRoot}',
      '{projectParentAddDirArgs}',
      '--allowedTools',
      'Bash,Read,Write',
      '--permission-mode',
      'bypassPermissions',
      '-p',
      '-'
    ]);
    expect(codebuddy?.interactiveCommand).toEqual([
      'codebuddy',
      '--add-dir',
      '{workspaceRoot}',
      '{projectParentAddDirArgs}',
      '--allowedTools',
      'Bash,Read,Write',
      '--permission-mode',
      'bypassPermissions',
      '{prompt}'
    ]);
  });

  it('生成 Prompt Envelope 并包含技能调用文本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    await fs.mkdir(path.join(root, '.codex', 'skills', 'coding-prd-analyzer'), { recursive: true });
    await fs.writeFile(path.join(root, '.codex', 'skills', 'coding-prd-analyzer', 'SKILL.md'), 'skill');
    const promptPath = await createPromptEnvelope(root, workflow(), runRecord('run-1'), '/coding-prd-analyzer id=172014');
    const content = await fs.readFile(path.join(root, promptPath), 'utf8');
    expect(content).toContain('/coding-prd-analyzer id=172014');
    expect(content).toContain('.codex/skills/coding-prd-analyzer/SKILL.md');
  });

  it('启动 Agent 后记录 stdout 和退出事件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'node-agent',
      name: 'Node Agent',
      inputMode: 'PROMPT_FILE',
      command: [process.execPath, '-e', 'console.log("agent-ok")'],
      available: true,
      supportsStreaming: true
    };
    const run = runRecord('run-stdout');
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });
    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    const updated = await updatedPromise;
    const events = await readRunEvents(root, '172014', run.id);
    expect(updated.status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('agent-ok'))).toBe(true);
  });

  it('STDIN 模式向 Agent 传入完整 Prompt Envelope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'node-stdin-agent',
      name: 'Node STDIN Agent',
      inputMode: 'STDIN',
      command: [
        process.execPath,
        '-e',
        'let data = ""; process.stdin.on("data", (chunk) => data += chunk); process.stdin.on("end", () => console.log(data.includes("AI Delivery Agent Task") && data.includes("/coding-prd-analyzer id=172014") ? "stdin-envelope-ok" : data));'
      ],
      available: true,
      supportsStreaming: true
    };
    const run = runRecord('run-stdin');
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });
    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    const updated = await updatedPromise;
    const events = await readRunEvents(root, '172014', run.id);
    expect(updated.status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('stdin-envelope-ok'))).toBe(true);
  });

  it('终端模式下 Codex STDIN 命令改为 prompt 参数以保留终端交互', () => {
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'STDIN',
      command: ['codex', 'exec', '-C', '{workspaceRoot}', '-'],
      available: true,
      supportsStreaming: true
    };

    expect(terminalCommandLine(provider, ['codex', 'exec', '-C', '/workspace', '-'])).toBe(
      "'codex' 'exec' '-C' '/workspace' \"$(cat \"$PROMPT_FILE\")\""
    );
  });

  it('交互终端命令按参数数组安全转义', () => {
    expect(interactiveTerminalCommandLine(['codex', '-C', '/workspace', "hello 'user'"])).toBe("'codex' '-C' '/workspace' 'hello '\\''user'\\'''");
  });

  it('交互终端命令不通过 pipe 占用 TUI stdin', () => {
    expect(interactiveTerminalCommandLine(['codebuddy', '--permission-mode', 'bypassPermissions', 'prompt text'])).toBe(
      "'codebuddy' '--permission-mode' 'bypassPermissions' 'prompt text'"
    );
  });

  it('Codex 终端命令将工程父目录追加为 add-dir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'STDIN',
      command: ['codex', 'exec', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '-'],
      interactiveCommand: ['codex', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '--no-alt-screen', '{prompt}'],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const run = {
      ...runRecord('run-codex-script'),
      agentId: 'codex',
      executionMode: 'TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', [projectParent]);

    expect(terminal.commandLine).toContain(`'-C' '${root}' '--add-dir' '${projectParent}'`);
    expect(terminal.commandLine).toContain('"$(cat "$PROMPT_FILE")"');
  });

  it('Codex 交互终端命令将工程父目录追加为 add-dir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'STDIN',
      command: ['codex', 'exec', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '-'],
      interactiveCommand: ['codex', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '--no-alt-screen', '{prompt}'],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const run = {
      ...runRecord('run-codex-interactive-script'),
      agentId: 'codex',
      executionMode: 'INTERACTIVE_TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', [projectParent]);

    expect(terminal.commandLine).toContain(`'-C' '${root}' '--add-dir' '${projectParent}' '--no-alt-screen'`);
    expect(terminal.commandLine).toContain('AI Delivery Agent Task');
  });

  it('生成本地终端脚本并记录 transcript 和状态路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const provider: AgentProvider = {
      id: 'node-agent',
      name: 'Node Agent',
      inputMode: 'PROMPT_FILE',
      command: [process.execPath, '-e', 'console.log("terminal-ok")'],
      available: true,
      supportsStreaming: true
    };
    const run = {
      ...runRecord('run-terminal-script'),
      executionMode: 'TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014');
    const script = await fs.readFile(path.join(root, terminal.scriptPath), 'utf8');

    expect(terminal.scriptPath).toBe('docs/172014/workflow/scripts/run-terminal-script.command');
    expect(terminal.transcriptPath).toBe('docs/172014/workflow/runs/run-terminal-script.terminal.log');
    expect(terminal.statusPath).toBe('docs/172014/workflow/runs/run-terminal-script.terminal-status.json');
    expect(script).toContain('AI Delivery');
    expect(script).toContain('/coding-prd-analyzer id=172014');
    expect(script).toContain('terminal-status.json');
  });

  it('生成交互终端脚本时使用 interactiveCommand 模板', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const provider: AgentProvider = {
      id: 'interactive-agent',
      name: 'Interactive Agent',
      inputMode: 'PROMPT_FILE',
      command: ['background-agent'],
      interactiveCommand: ['interactive-agent', '--workspace', '{workspaceRoot}', '--prompt', '{prompt}'],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const run = {
      ...runRecord('run-interactive-script'),
      executionMode: 'INTERACTIVE_TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014');
    const script = await fs.readFile(path.join(root, terminal.scriptPath), 'utf8');

    expect(terminal.commandLine).toContain("'interactive-agent'");
    expect(terminal.commandLine).not.toContain('background-agent');
    expect(script).toContain("EXECUTION_MODE='INTERACTIVE_TERMINAL'");
    expect(script).toContain("EXECUTION_MODE_LABEL='交互终端'");
    expect(script).toContain('script -q -a "$TRANSCRIPT_FILE" zsh -lc "setopt pipefail; $COMMAND_PREVIEW"');
  });

  it('CodeBuddy 交互终端脚本通过 prompt 参数进入 TUI', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const provider: AgentProvider = {
      id: 'codebuddy',
      name: 'CodeBuddy',
      inputMode: 'STDIN',
      command: ['codebuddy', '--add-dir', '{workspaceRoot}', '{projectParentAddDirArgs}', '--allowedTools', 'Bash,Read,Write', '--permission-mode', 'bypassPermissions', '-p', '-'],
      interactiveCommand: ['codebuddy', '--add-dir', '{workspaceRoot}', '{projectParentAddDirArgs}', '--allowedTools', 'Bash,Read,Write', '--permission-mode', 'bypassPermissions', '{prompt}'],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const run = {
      ...runRecord('run-codebuddy-interactive-tui'),
      agentId: 'codebuddy',
      executionMode: 'INTERACTIVE_TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', [projectParent]);

    expect(terminal.commandLine).toContain(`'codebuddy' '--add-dir' '${root}' '--add-dir' '${projectParent}'`);
    expect(terminal.commandLine).toContain("'--permission-mode' 'bypassPermissions'");
    expect(terminal.commandLine).toContain('AI Delivery Agent Task');
    expect(terminal.commandLine).not.toContain("'-p' '-'");
    expect(terminal.commandLine).not.toContain('cat ');
  });

  it('刷新本地终端状态文件并更新运行记录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const item = workflow();
    const run: RunRecord = {
      ...runRecord('run-terminal-finished'),
      status: 'TERMINAL_OPENED',
      executionMode: 'TERMINAL',
      terminalStatusPath: 'docs/172014/workflow/runs/run-terminal-finished.terminal-status.json',
      terminalTranscriptPath: 'docs/172014/workflow/runs/run-terminal-finished.terminal.log'
    };
    item.runs.push(run);
    await fs.mkdir(path.join(root, 'docs', '172014', 'workflow', 'runs'), { recursive: true });
    await fs.writeFile(
      path.join(root, run.terminalStatusPath),
      JSON.stringify({
        status: 'SUCCEEDED',
        exitCode: 0,
        finishedAt: '2026-05-22T00:00:00.000Z',
        transcriptPath: run.terminalTranscriptPath
      })
    );

    const refreshed = await refreshTerminalRunStatuses(root, item);
    const events = await readRunEvents(root, '172014', run.id);

    expect(refreshed.changed).toBe(true);
    expect(refreshed.workflow.runs[0].status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'EXIT' && event.message.includes('终端 Agent'))).toBe(true);
  });

  it('刷新交互终端状态文件并保留交互终端语义', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const item = workflow();
    const run: RunRecord = {
      ...runRecord('run-interactive-finished'),
      status: 'TERMINAL_OPENED',
      executionMode: 'INTERACTIVE_TERMINAL',
      terminalStatusPath: 'docs/172014/workflow/runs/run-interactive-finished.terminal-status.json',
      terminalTranscriptPath: 'docs/172014/workflow/runs/run-interactive-finished.terminal.log'
    };
    item.runs.push(run);
    await fs.mkdir(path.join(root, 'docs', '172014', 'workflow', 'runs'), { recursive: true });
    await fs.writeFile(
      path.join(root, run.terminalStatusPath),
      JSON.stringify({
        status: 'SUCCEEDED',
        exitCode: 0,
        finishedAt: '2026-05-22T00:00:00.000Z',
        transcriptPath: run.terminalTranscriptPath
      })
    );

    const refreshed = await refreshTerminalRunStatuses(root, item);
    const events = await readRunEvents(root, '172014', run.id);

    expect(refreshed.changed).toBe(true);
    expect(refreshed.workflow.runs[0].executionMode).toBe('INTERACTIVE_TERMINAL');
    expect(refreshed.workflow.runs[0].status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'EXIT' && event.message.includes('交互终端 Agent'))).toBe(true);
  });

  it('可以取消正在运行的 Agent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'node-agent',
      name: 'Node Agent',
      inputMode: 'PROMPT_FILE',
      command: [process.execPath, '-e', 'setTimeout(() => {}, 10000)'],
      available: true,
      supportsStreaming: true
    };
    const run = runRecord('run-cancel');
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });
    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    await cancelAgentRun(root, '172014', run.id);
    const updated = await updatedPromise;
    expect(updated.status).toBe('CANCELLED');
  });
});
