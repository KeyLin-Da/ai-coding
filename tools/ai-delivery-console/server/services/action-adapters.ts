import { spawn } from 'node:child_process';
import type { ActionInput, RunRecord, RunStatus } from '../../shared/workflow';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createRunId, appendRunEvent } from './run-log';
import { assertInsideWorkspace } from './workspace';
import { executeWithCodex, isCodexAvailable } from './codex-bridge';
import { serverConfig } from '../config';

const cliActionMap: Partial<Record<ActionInput['actionType'], string[]>> = {
  OPENSPEC_STATUS: ['openspec', 'status'],
  OPENSPEC_NEW_CHANGE: ['openspec', 'new', 'change'],
  OPENSPEC_INSTRUCTIONS: ['openspec', 'instructions']
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function buildSkillCommand(workflow: RequirementWorkflow, action: ActionInput): string {
  const params = action.params || {};
  const requirementId = workflow.requirementId;
  const sources = Array.isArray(params.sources) ? params.sources.join(',') : workflow.sources.join(',');
  const description = asString(params.description, workflow.title);
  const moduleName = asString(params.moduleName);
  const branchName = asString(params.branchName, workflow.branchName || '');
  const changeName = asString(params.changeName, `req-${requirementId}`);

  switch (action.actionType) {
    case 'PRD_ANALYZE':
      return `/prd id=${requirementId}${description ? ` c=${description}` : ''}${sources ? ` ${sources}` : ''}`;
    case 'DESIGN_GENERATE':
      return `/coding-design d=${params.documentPath || description} r=${requirementId}`;
    case 'JUNIT_GENERATE':
      return `generate-unit-test ${moduleName || '<module-name>'}${description ? ` "${description}"` : ''}`;
    case 'CODE_REVIEW':
      return `/coding-review b=${branchName || '<branch-name>'}${params.docs ? ` d=${params.docs}` : ''}`;
    case 'OPENSPEC_FF':
      return `/openspec-ff-change ${changeName}`;
    case 'OPENSPEC_APPLY':
      return `/openspec-apply-change ${changeName}`;
    case 'OPENSPEC_VERIFY':
      return `/openspec-verify-change ${changeName}`;
    default:
      return '';
  }
}

function runCli(workspaceRoot: string, args: string[]): Promise<{ status: RunStatus; output: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: workspaceRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      resolve({ status: 'FAILED', output: stdout, error: error.message });
    });
    child.on('close', (code) => {
      resolve({
        status: code === 0 ? 'SUCCEEDED' : 'FAILED',
        output: stdout,
        error: code === 0 ? undefined : stderr || `命令退出码: ${code}`
      });
    });
  });
}

export function validateActionInput(workspaceRoot: string, action: ActionInput): void {
  const params = action.params || {};
  for (const key of ['documentPath', 'artifactPath', 'outputPath']) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) {
      assertInsideWorkspace(workspaceRoot, value);
    }
  }
  const allowed = new Set<ActionInput['actionType']>([
    'PRD_ANALYZE',
    'DESIGN_GENERATE',
    'OPENSPEC_STATUS',
    'OPENSPEC_NEW_CHANGE',
    'OPENSPEC_INSTRUCTIONS',
    'OPENSPEC_FF',
    'OPENSPEC_APPLY',
    'OPENSPEC_VERIFY',
    'JUNIT_GENERATE',
    'CODE_REVIEW',
    'RETURN_TO_IMPLEMENTATION',
    'REFRESH_ARTIFACTS'
  ]);
  if (!allowed.has(action.actionType)) {
    throw new Error(`不支持的动作: ${action.actionType}`);
  }
}

export async function executeAction(workspaceRoot: string, workflow: RequirementWorkflow, action: ActionInput): Promise<RunRecord> {
  validateActionInput(workspaceRoot, action);
  const runId = createRunId();
  const params = action.params || {};
  const startedAt = new Date().toISOString();
  const run: RunRecord = {
    id: runId,
    requirementId: workflow.requirementId,
    actionType: action.actionType,
    status: 'RUNNING',
    startedAt,
    params
  };

  await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
    level: 'INFO',
    message: `开始执行 ${action.actionType}`
  });

  if (action.actionType === 'RETURN_TO_IMPLEMENTATION' || action.actionType === 'REFRESH_ARTIFACTS') {
    run.status = 'SUCCEEDED';
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      level: 'INFO',
      message: '本地状态动作已完成'
    });
    return run;
  }

  const cliBase = cliActionMap[action.actionType];
  if (cliBase) {
    const changeName = asString(params.changeName, `req-${workflow.requirementId}`);
    const artifactId = asString(params.artifactId, 'proposal');
    const args =
      action.actionType === 'OPENSPEC_STATUS'
        ? [...cliBase, '--change', changeName, '--json']
        : action.actionType === 'OPENSPEC_NEW_CHANGE'
          ? [...cliBase, changeName]
          : [...cliBase, artifactId, '--change', changeName, '--json'];
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      level: 'INFO',
      message: `执行命令: ${args.join(' ')}`
    });
    const result = await runCli(workspaceRoot, args);
    run.status = result.status;
    run.error = result.error;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      level: result.status === 'SUCCEEDED' ? 'INFO' : 'ERROR',
      message: result.status === 'SUCCEEDED' ? 'OpenSpec 命令执行完成' : 'OpenSpec 命令执行失败',
      data: { output: result.output, error: result.error }
    });
    return run;
  }

  const commandText = buildSkillCommand(workflow, action);
  
  // 检查是否启用 Codex 自动化
  if (serverConfig.codex.enabled) {
    const codexAvailable = await isCodexAvailable();
    if (codexAvailable) {
      await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
        level: 'INFO',
        message: '使用 Codex 自动执行命令'
      });
      
      const result = await executeWithCodex(workspaceRoot, commandText, workflow.requirementId);
      run.status = result.status;
      run.error = result.error;
      run.finishedAt = new Date().toISOString();
      
      await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
        level: result.status === 'SUCCEEDED' ? 'INFO' : 'ERROR',
        message: result.status === 'SUCCEEDED' ? 'Codex 执行完成' : 'Codex 执行失败',
        data: { output: result.output, error: result.error }
      });
      
      return run;
    } else {
      await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
        level: 'WARN',
        message: 'Codex 不可用，回退到手动模式'
      });
    }
  }
  
  // 回退到手动模式
  run.status = 'WAITING_FOR_AGENT';
  run.commandText = commandText;
  run.finishedAt = new Date().toISOString();
  await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
    level: 'WARN',
    message: '当前环境没有配置 Agent Bridge，请复制标准调用文本到 Agent 执行',
    data: { commandText }
  });
  return run;
}
