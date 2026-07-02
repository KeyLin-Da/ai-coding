import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentProvider, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  cancelAgentRun,
  createPromptEnvelope,
  createTerminalRunScript,
  interactiveTerminalCommandLine,
  listAgentProviders,
  refreshTerminalRunStatuses,
  retryWorkflowCenterRunStatuses,
  startAgentProcess,
  terminalCommandLine
} from '../../server/services/agent-providers';
import { readRunEvents } from '../../server/services/run-log';
import { getRunnerRuntimeRoot, resolveWorkspaceOrRuntimePath } from '../../server/services/runtime-paths';

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
  it('默认提供 AI Agent Provider 列表', async () => {
    const providers = await listAgentProviders();
    expect(providers.map((provider) => provider.id)).toEqual(expect.arrayContaining(['codex', 'codebuddy', 'qoder', 'qwen']));
    expect(providers.map((provider) => provider.id)).not.toEqual(expect.arrayContaining(['openspec', 'git', 'node']));
    const codex = providers.find((provider) => provider.id === 'codex');
    expect(codex?.inputMode).toBe('STDIN');
    expect(codex?.command).toEqual([
      'codex',
      'exec',
      '--json',
      '--sandbox',
      'workspace-write',
      '-C',
      '{workspaceRoot}',
      '{projectParentAddDirArgs}',
      '{projectAddDirArgs}',
      '-'
    ]);
    expect(codex?.interactiveCommand).toEqual([
      'codex',
      '--sandbox',
      'workspace-write',
      '-C',
      '{workspaceRoot}',
      '{projectParentAddDirArgs}',
      '{projectAddDirArgs}',
      '--no-alt-screen',
      '{prompt}'
    ]);
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
    const qoder = providers.find((provider) => provider.id === 'qoder');
    expect(qoder?.inputMode).toBe('STDIN');
    expect(qoder?.command).toEqual(['qcode', '-w', '{workspaceRoot}', '-']);
    const qwen = providers.find((provider) => provider.id === 'qwen');
    expect(qwen?.inputMode).toBe('STDIN');
    expect(qwen?.command).toEqual(['qwen', '-']);
  });

  it('生成 Prompt Envelope 并包含技能调用文本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    await fs.mkdir(path.join(root, '.codex', 'skills', 'coding-prd-analyzer'), { recursive: true });
    await fs.writeFile(path.join(root, '.codex', 'skills', 'coding-prd-analyzer', 'SKILL.md'), 'skill');
    const promptPath = await createPromptEnvelope(root, workflow(), runRecord('run-1'), '/coding-prd-analyzer id=172014');
    const content = await fs.readFile(resolveWorkspaceOrRuntimePath(root, promptPath), 'utf8');
    expect(content).toContain('/coding-prd-analyzer id=172014');
    expect(content).toContain('.codex/skills/coding-prd-analyzer/SKILL.md');
  });

  it('Prompt Envelope 声明涉及工程优先搜索和只读扩展边界', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const promptPath = await createPromptEnvelope(root, item, runRecord('run-projects'), '/coding-design d=定位菜单 r=172014 p=opp-api', [projectParent]);
    const content = await fs.readFile(resolveWorkspaceOrRuntimePath(root, promptPath), 'utf8');

    expect(content).toContain('## 工程代码目录');
    expect(content).toContain('### 已配置工程父目录');
    expect(content).toContain(projectParent);
    expect(content).toContain('### 本次涉及工程');
    expect(content).toContain(projectRoot);
    expect(content).toContain('## 工程检索策略');
    expect(content).toContain('本次涉及工程”是优先搜索工程，不是完整只读检索边界');
    expect(content).toContain('可在已配置工程父目录内只读扩展检索');
    expect(content).toContain('自动扩展工程仅允许只读分析');
    expect(content).toContain('工程代码修改仅限本次涉及工程或用户明确确认的工程');
    expect(content).not.toContain('工程代码的读取和修改仅限于上方列出的工程代码目录');
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

  it('后台 Codex JSON 输出记录 token usage，未映射 Center Run 时只保留本地明细', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'PROMPT_FILE',
      command: [
        process.execPath,
        '-e',
        'process.stdout.write(JSON.stringify({type:"turn.completed",id:"turn-1",usage:{input_tokens:10,cached_input_tokens:4,output_tokens:2,reasoning_output_tokens:1}}));'
      ],
      available: true,
      supportsStreaming: true
    };
    const run = { ...runRecord('run-codex-usage'), agentId: 'codex' };
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });

    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    const updated = await updatedPromise;
    const events = await readRunEvents(root, '172014', run.id);
    const usageEvent = events.find((event) => (event.data as any)?.kind === 'TOKEN_USAGE');

    expect(updated.status).toBe('SUCCEEDED');
    expect(usageEvent?.message).toContain('Token usage');
    expect((usageEvent?.data as any).usage.totalTokens).toBe(12);
    expect((usageEvent?.data as any).centerUpload).toBe('SKIPPED_NO_CENTER_RUN');
  });

  it('Center token usage 上报失败不影响 Agent 成功状态', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const fetchImpl = async () => ({
      ok: false,
      json: async () => ({ success: false, message: 'center down' })
    });
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'PROMPT_FILE',
      command: [
        process.execPath,
        '-e',
        'console.log(JSON.stringify({type:"turn.completed",id:"turn-1",usage:{input_tokens:10,output_tokens:2}}));'
      ],
      available: true,
      supportsStreaming: true
    };
    const run = { ...runRecord('run-center-upload-failure'), agentId: 'codex', centerRunId: 700 };
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });

    await startAgentProcess(
      root,
      workflow(),
      run,
      provider,
      '/coding-prd-analyzer id=172014',
      async (nextRun) => resolveUpdate(nextRun),
      [],
      {
        centerBaseUrl: 'http://127.0.0.1:8728',
        userId: 1,
        clientSessionId: 10,
        fetchImpl: fetchImpl as unknown as typeof fetch
      }
    );
    const updated = await updatedPromise;
    const events = await readRunEvents(root, '172014', run.id);

    expect(updated.status).toBe('SUCCEEDED');
    expect(events.some((event) => (event.data as any)?.kind === 'TOKEN_USAGE_UPLOAD_FAILED')).toBe(true);
    expect(updated.tokenUsageOutboxPath).toContain('token-usage-outbox');
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

  it('Codex 终端命令将工程父目录和涉及工程追加为 add-dir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'STDIN',
      command: ['codex', 'exec', '--sandbox', 'workspace-write', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '{projectAddDirArgs}', '-'],
      interactiveCommand: [
        'codex',
        '--sandbox',
        'workspace-write',
        '-C',
        '{workspaceRoot}',
        '{projectParentAddDirArgs}',
        '{projectAddDirArgs}',
        '--no-alt-screen',
        '{prompt}'
      ],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const run = {
      ...runRecord('run-codex-script'),
      agentId: 'codex',
      executionMode: 'TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, item, run, provider, '/coding-prd-analyzer id=172014', [projectParent]);

    expect(terminal.commandLine).toContain(`'--sandbox' 'workspace-write' '-C' '${root}' '--add-dir' '${projectParent}' '--add-dir' '${projectRoot}'`);
    expect(terminal.commandLine).toContain('"$(cat "$PROMPT_FILE")"');
  });

  it('Codex 交互终端命令将工程父目录和涉及工程追加为 add-dir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'STDIN',
      command: ['codex', 'exec', '--sandbox', 'workspace-write', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '{projectAddDirArgs}', '-'],
      interactiveCommand: [
        'codex',
        '--sandbox',
        'workspace-write',
        '-C',
        '{workspaceRoot}',
        '{projectParentAddDirArgs}',
        '{projectAddDirArgs}',
        '--no-alt-screen',
        '{prompt}'
      ],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const run = {
      ...runRecord('run-codex-interactive-script'),
      agentId: 'codex',
      executionMode: 'INTERACTIVE_TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, item, run, provider, '/coding-prd-analyzer id=172014', [projectParent]);
    const runtimeRoot = getRunnerRuntimeRoot(root);

    expect(terminal.commandLine).toContain(
      `'--sandbox' 'workspace-write' '-C' '${root}' '--add-dir' '${projectParent}' '--add-dir' '${projectRoot}' '--add-dir' '${runtimeRoot}' '--no-alt-screen'`
    );
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
    const script = await fs.readFile(resolveWorkspaceOrRuntimePath(root, terminal.scriptPath), 'utf8');

    expect(terminal.scriptPath).toBe('.ai-delivery-runtime/requirements/172014/scripts/run-terminal-script.command');
    expect(terminal.transcriptPath).toBe('.ai-delivery-runtime/requirements/172014/runs/run-terminal-script.terminal.log');
    expect(terminal.statusPath).toBe('.ai-delivery-runtime/requirements/172014/runs/run-terminal-script.terminal-status.json');
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
    const script = await fs.readFile(resolveWorkspaceOrRuntimePath(root, terminal.scriptPath), 'utf8');

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
      terminalStatusPath: '.ai-delivery-runtime/requirements/172014/runs/run-terminal-finished.terminal-status.json',
      terminalTranscriptPath: '.ai-delivery-runtime/requirements/172014/runs/run-terminal-finished.terminal.log'
    };
    item.runs.push(run);
    await fs.mkdir(path.dirname(resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath)), { recursive: true });
    await fs.writeFile(
      resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath),
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
      terminalStatusPath: '.ai-delivery-runtime/requirements/172014/runs/run-interactive-finished.terminal-status.json',
      terminalTranscriptPath: '.ai-delivery-runtime/requirements/172014/runs/run-interactive-finished.terminal.log'
    };
    item.runs.push(run);
    await fs.mkdir(path.dirname(resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath)), { recursive: true });
    await fs.writeFile(
      resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath),
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

  it.each(['TERMINAL', 'INTERACTIVE_TERMINAL'] as const)(
    '%s 模式从 Codex Session 采集 token、上传 Center 并完成 Job',
    async (executionMode) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-token-'));
      const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-home-'));
      const originalCodexHome = process.env.CODEX_HOME;
      process.env.CODEX_HOME = codexHome;
      const item = workflow();
      const run: RunRecord = {
        ...runRecord(`run-${executionMode.toLowerCase()}-token`),
        agentId: 'codex',
        status: 'TERMINAL_OPENED',
        executionMode,
        centerJobId: 500,
        centerRunId: 900,
        terminalStatusPath: `.ai-delivery-runtime/requirements/172014/runs/run-${executionMode.toLowerCase()}-token.terminal-status.json`,
        terminalTranscriptPath: `.ai-delivery-runtime/requirements/172014/runs/run-${executionMode.toLowerCase()}-token.terminal.log`
      };
      item.runs.push(run);
      const sessionDir = path.join(codexHome, 'sessions', '2026', '06', '22');
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionDir, `rollout-${executionMode.toLowerCase()}.jsonl`),
        [
          JSON.stringify({ timestamp: '2026-06-22T03:00:00.000Z', type: 'session_meta', payload: { id: `session-${executionMode}` } }),
          JSON.stringify({ timestamp: '2026-06-22T03:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.5' } }),
          JSON.stringify({ timestamp: '2026-06-22T03:00:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: run.id } }),
          JSON.stringify({
            timestamp: '2026-06-22T03:00:03.000Z',
            type: 'event_msg',
            payload: {
              type: 'token_count',
              info: {
                total_token_usage: {
                  input_tokens: 10,
                  cached_input_tokens: 4,
                  output_tokens: 2,
                  reasoning_output_tokens: 1,
                  total_tokens: 12
                }
              }
            }
          })
        ].join('\n') + '\n',
        'utf8'
      );
      await fs.mkdir(path.dirname(resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath)), { recursive: true });
      await fs.writeFile(
        resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath),
        JSON.stringify({
          status: 'SUCCEEDED',
          exitCode: 0,
          finishedAt: '2026-06-22T03:00:04.000Z',
          transcriptPath: run.terminalTranscriptPath
        })
      );
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: {} })
      }));

      try {
        const refreshed = await refreshTerminalRunStatuses(root, item, {
          centerBaseUrl: 'http://127.0.0.1:8728',
          userId: 1,
          clientSessionId: 10,
          fetchImpl: fetchImpl as unknown as typeof fetch
        });
        const events = await readRunEvents(root, '172014', run.id);

        expect(refreshed.workflow.runs[0].status).toBe('SUCCEEDED');
        expect(events.some((event) => (event.data as any)?.kind === 'TOKEN_USAGE')).toBe(true);
        const usageCall = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/run-token-usages'));
        expect(String(usageCall?.[1]?.body)).toContain('"runId":900');
        expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/jobs/500/complete'))).toBe(true);
      } finally {
        if (originalCodexHome === undefined) {
          delete process.env.CODEX_HOME;
        } else {
          process.env.CODEX_HOME = originalCodexHome;
        }
      }
    }
  );

  it('Center 状态同步失败后保留待同步状态，并在后续刷新补偿成功', async () => {
    const item = workflow();
    const run: RunRecord = {
      ...runRecord('run-center-status-retry'),
      status: 'CANCELLED',
      centerJobId: 500,
      centerRunId: 900,
      error: '用户取消运行'
    };
    item.runs.push(run);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, message: 'center down' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 500, status: 'CANCELLED' } })
      });
    const config = {
      centerBaseUrl: 'http://127.0.0.1:8728',
      userId: 1,
      clientSessionId: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch
    };

    expect(await retryWorkflowCenterRunStatuses(item, config)).toBe(false);
    expect(run.centerSyncedAt).toBeUndefined();

    expect(await retryWorkflowCenterRunStatuses(item, config)).toBe(true);
    expect(run.centerSyncedAt).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url]) => String(url).endsWith('/jobs/500/cancel'))).toBe(true);
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
