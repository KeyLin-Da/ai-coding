import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { AgentProvider, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  executeAction,
  internalForTests
} from '../../server/services/action-adapters';
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

const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await exec('git', args, { cwd });
}

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

describe('action-adapters', () => {
  it('普通需求生成技术方案命令时保留 PRD 文档上下文', () => {
    const item = {
      ...workflow(),
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '补充图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    expect(internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} })).toBe(
      '/coding-design d=docs/172014/prd/analysis.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
  });

  it('缺陷生成技术方案命令不自动携带 PRD 文档路径', () => {
    const item = {
      ...workflow(),
      title: '邀请好友积分异常',
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      techDesignClarification: '后台配置为 1，实际奖励 10',
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} });

    expect(command).toBe('/coding-design d=邀请好友积分异常,后台配置为 1，实际奖励 10,docs/172014/technical-design/files/source-1.png r=172014');
    expect(command).not.toContain('/prd/');
  });

  it('普通需求 OpenSpec 快速生成命令保留 PRD 文档和 PRD 文件目录', () => {
    expect(internalForTests.buildSkillCommand(workflow(), { actionType: 'OPENSPEC_FF', params: {} })).toBe(
      '/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md,docs/172014/prd/files'
    );
  });

  it('缺陷 OpenSpec 快速生成命令不自动携带 PRD 文档和 PRD 文件目录', () => {
    const item = {
      ...workflow(),
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, { actionType: 'OPENSPEC_FF', params: {} });

    expect(command).toBe('/openspec-ff-change req-172014 d=docs/172014/technical-design/design_review.md,docs/172014/technical-design/files/source-1.png');
    expect(command).not.toContain('/prd/');
  });

  it('生成 commit 模式代码评审命令并包含需求号、工程范围、分支和外部文档', () => {
    const item = {
      ...workflow(),
      projects: [
        { name: 'opp-api', path: 'opp-api' },
        { name: 'opp-learn', path: 'opp-learn' }
      ]
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'CODE_REVIEW',
        params: {
          docs: 'docs/172014/technical-design/design_review.md'
        }
      })
    ).toBe('/coding-review r=172014 p=opp-api,opp-learn m=commit b=feature/opp-172014 d=docs/172014/technical-design/design_review.md');
  });

  it('生成 staged 模式代码评审命令时不拼接分支参数', () => {
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-learn', path: 'opp-learn' }]
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'CODE_REVIEW',
        params: {
          reviewMode: 'staged',
          branchName: 'feature/ignored'
        }
      })
    ).toBe('/coding-review r=172014 p=opp-learn m=staged');
  });

  it('未维护涉及工程时生成代码评审工程占位符', () => {
    expect(internalForTests.buildSkillCommand(workflow(), { actionType: 'CODE_REVIEW', params: {} })).toBe(
      '/coding-review r=172014 p=<project-list> m=commit b=feature/opp-172014'
    );
  });

  it('staged 模式代码评审在无暂存文件时阻止启动 Agent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const projectRoot = path.join(root, 'opp-learn');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-learn', path: 'opp-learn' }]
    };

    const run = await executeAction(root, item, {
      actionType: 'CODE_REVIEW',
      params: {
        reviewMode: 'staged',
        agentId: 'missing-agent'
      }
    });
    const events = await readRunEvents(root, '172014', run.id);

    expect(run.status).toBe('FAILED');
    expect(run.error).toContain('暂存区没有已暂存文件');
    expect(events.some((event) => event.message.includes('暂存区没有已暂存文件'))).toBe(true);
  });
});

describe('agent-providers', () => {
  it('内置 CLI 执行时实时追加 stdout 和 stderr 事件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-cli-'));
    const events: Array<{ type: string; text?: string }> = [];

    const result = await internalForTests.runCli(
      root,
      [process.execPath, '-e', 'console.log("cli-out"); console.error("cli-err");'],
      async (event) => {
        events.push(event);
      }
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('cli-out'))).toBe(true);
    expect(events.some((event) => event.type === 'STDERR' && event.text?.includes('cli-err'))).toBe(true);
  });

  it('默认提供 codex Provider', async () => {
    const providers = await listAgentProviders();
    expect(providers.map((provider) => provider.id)).toEqual(expect.arrayContaining(['codex']));
    const codex = providers.find((provider) => provider.id === 'codex');
    expect(codex?.inputMode).toBe('STDIN');
    expect(codex?.command).toEqual(['codex', 'exec', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '-']);
    expect(codex?.interactiveCommand).toEqual(['codex', '-C', '{workspaceRoot}', '{projectParentAddDirArgs}', '--no-alt-screen', '{prompt}']);
    expect(codex?.supportsInteractive).toBe(true);
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

  it('Prompt Envelope 区分交付工作区和工程代码目录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const promptPath = await createPromptEnvelope(root, item, runRecord('run-projects'), '/coding-prd-analyzer id=172014', [projectParent]);
    const content = await fs.readFile(path.join(root, promptPath), 'utf8');

    expect(content).toContain(`- 交付工作区: ${root}`);
    expect(content).toContain('## 工程代码目录');
    expect(content).toContain(projectParent);
    expect(content).toContain(projectRoot);
    expect(content).toContain('交付产物、OpenSpec 工件、运行日志和报告必须写入交付工作区');
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

  it('CodeBuddy 终端命令将涉及工程追加为 add-dir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const provider: AgentProvider = {
      id: 'codebuddy',
      name: 'CodeBuddy',
      inputMode: 'STDIN',
      command: ['codebuddy', '--add-dir', '{workspaceRoot}', '{projectAddDirArgs}', '-'],
      available: true,
      supportsStreaming: false
    };
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const run = {
      ...runRecord('run-codebuddy-script'),
      agentId: 'codebuddy',
      executionMode: 'TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, item, run, provider, '/coding-prd-analyzer id=172014', [projectParent]);

    expect(terminal.commandLine).toContain(`'--add-dir' '${root}' '--add-dir' '${projectRoot}'`);
    expect(terminal.commandLine).toContain('"$(cat "$PROMPT_FILE")"');
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
