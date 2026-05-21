import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentProvider, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { cancelAgentRun, createPromptEnvelope, listAgentProviders, startAgentProcess } from '../../server/services/agent-providers';
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
    expect(codex?.command).toEqual(['codex', 'exec', '-C', '{workspaceRoot}', '-']);
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
