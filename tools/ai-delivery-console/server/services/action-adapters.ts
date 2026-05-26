import { spawn } from 'node:child_process';
import type { ActionInput, ExecutionMode, RunRecord, RunStatus } from '../../shared/workflow';
import { implementationStepForAction, stageForAction } from '../../shared/workflow';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createRunId, appendRunEvent } from './run-log';
import { assertInsideWorkspace } from './workspace';
import { getAgentProvider, startAgentInTerminal, startAgentProcess } from './agent-providers';
import { normalizePrdClarification } from './workflow-repository';

const cliActionMap: Partial<Record<ActionInput['actionType'], string[]>> = {
  OPENSPEC_STATUS: ['openspec', 'status'],
  OPENSPEC_NEW_CHANGE: ['openspec', 'new', 'change'],
  OPENSPEC_INSTRUCTIONS: ['openspec', 'instructions']
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function hasParam(params: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function executionMode(params: Record<string, unknown>): ExecutionMode {
  return params.executionMode === 'TERMINAL' ? 'TERMINAL' : 'BACKGROUND';
}

function prdDescription(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  if (hasParam(params, 'description')) {
    return normalizePrdClarification(typeof params.description === 'string' ? params.description : '') || '';
  }
  return workflow.prdClarification || '';
}

function prdDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const explicitPath = asString(params.documentPath);
  if (explicitPath) {
    return explicitPath;
  }
  const artifactPath = workflow.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path;
  return artifactPath || workflow.stages.PRD.artifactPath || `docs/${workflow.requirementId}/prd/analysis.md`;
}

function technicalDesignDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const explicitPath = asString(params.documentPath);
  if (explicitPath) {
    return explicitPath;
  }
  const artifactPath = workflow.artifacts.find((artifact) => artifact.stage === 'TECH_DESIGN' && artifact.exists && artifact.kind !== 'directory')?.path;
  return artifactPath || workflow.stages.TECH_DESIGN.artifactPath || `docs/${workflow.requirementId}/technical-design/design_review.md`;
}

function projectParam(workflow: RequirementWorkflow): string {
  return (workflow.projects || []).map((project) => project.path || project.name).filter(Boolean).join(',');
}

function buildSkillCommand(workflow: RequirementWorkflow, action: ActionInput): string {
  const params = action.params || {};
  const requirementId = workflow.requirementId;
  const sources = Array.isArray(params.sources) ? params.sources.join(',') : workflow.sources.join(',');
  const description = normalizePrdClarification(asString(params.description)) || '';
  const prdClarification = prdDescription(workflow, params);
  const moduleName = asString(params.moduleName);
  const branchName = asString(params.branchName, workflow.branchName || '');
  const changeName = asString(params.changeName, workflow.stages.IMPLEMENTATION.changeName || `req-${requirementId}`);
  const clarification = asString(params.clarification);
  const projects = projectParam(workflow);

  switch (action.actionType) {
    case 'PRD_ANALYZE':
      return `/coding-prd-analyzer id=${requirementId}${prdClarification ? ` c=${prdClarification}` : ''}${sources ? ` ${sources}` : ''}`;
    case 'DESIGN_GENERATE':
      return `/coding-design d=${prdDocumentPath(workflow, params)} r=${requirementId}${projects ? ` p=${projects}` : ''}${clarification ? ` c=${clarification}` : ''}`;
    case 'JUNIT_GENERATE':
      return `generate-unit-test ${moduleName || '<module-name>'}${description ? ` "${description}"` : ''}`;
    case 'CODE_REVIEW':
      return `/coding-review b=${branchName || '<branch-name>'}${params.docs ? ` d=${params.docs}` : ''}`;
    case 'OPENSPEC_FF':
      return `/openspec-ff-change ${changeName} d=${technicalDesignDocumentPath(workflow, params)}`;
    case 'OPENSPEC_APPLY':
      return `/openspec-apply-change ${changeName}`;
    case 'OPENSPEC_VERIFY':
      return `/openspec-verify-change ${changeName}`;
    case 'OPENSPEC_ARCHIVE':
      return `/openspec-archive-change ${changeName}`;
    default:
      return '';
  }
}

export function buildActionCommand(workflow: RequirementWorkflow, action: ActionInput): string {
  validateActionInput('', action, { skipPathValidation: true });
  const params = action.params || {};
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
    return args.join(' ');
  }
  if (isAgentAction(action.actionType)) {
    return buildSkillCommand(workflow, action);
  }
  throw new Error(`动作不支持复制命令: ${action.actionType}`);
}

function isAgentAction(actionType: ActionInput['actionType']): boolean {
  return ['PRD_ANALYZE', 'DESIGN_GENERATE', 'OPENSPEC_FF', 'OPENSPEC_APPLY', 'OPENSPEC_VERIFY', 'OPENSPEC_ARCHIVE', 'JUNIT_GENERATE', 'CODE_REVIEW'].includes(actionType);
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

export function validateActionInput(workspaceRoot: string, action: ActionInput, options: { skipPathValidation?: boolean } = {}): void {
  const params = action.params || {};
  if (!options.skipPathValidation) {
    for (const key of ['documentPath', 'artifactPath', 'outputPath']) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        assertInsideWorkspace(workspaceRoot, value);
      }
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
    'OPENSPEC_ARCHIVE',
    'JUNIT_GENERATE',
    'CODE_REVIEW',
    'RETURN_TO_IMPLEMENTATION',
    'REFRESH_ARTIFACTS'
  ]);
  if (!allowed.has(action.actionType)) {
    throw new Error(`不支持的动作: ${action.actionType}`);
  }
}

export async function executeAction(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  action: ActionInput,
  onRunUpdate: (run: RunRecord) => Promise<void> = async () => undefined
): Promise<RunRecord> {
  validateActionInput(workspaceRoot, action);
  const runId = createRunId();
  const params = action.params || {};
  const startedAt = new Date().toISOString();
  const run: RunRecord = {
    id: runId,
    requirementId: workflow.requirementId,
    actionType: action.actionType,
    stage: stageForAction(action.actionType),
    implementationStep: implementationStepForAction(action.actionType),
    status: 'RUNNING',
    startedAt,
    params,
    executionMode: executionMode(params)
  };

  await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
    type: 'START',
    level: 'INFO',
    message: `开始执行 ${action.actionType}`
  });

  if (action.actionType === 'RETURN_TO_IMPLEMENTATION' || action.actionType === 'REFRESH_ARTIFACTS') {
    run.status = 'SUCCEEDED';
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      type: 'INFO',
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
      type: 'INFO',
      level: 'INFO',
      message: `执行命令: ${args.join(' ')}`
    });
    const result = await runCli(workspaceRoot, args);
    run.status = result.status;
    run.error = result.error;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      type: result.status === 'SUCCEEDED' ? 'EXIT' : 'ERROR',
      level: result.status === 'SUCCEEDED' ? 'INFO' : 'ERROR',
      message: result.status === 'SUCCEEDED' ? 'OpenSpec 命令执行完成' : 'OpenSpec 命令执行失败',
      data: { output: result.output, error: result.error }
    });
    return run;
  }

  if (!isAgentAction(action.actionType)) {
    run.status = 'FAILED';
    run.error = `动作未实现: ${action.actionType}`;
    run.finishedAt = new Date().toISOString();
    return run;
  }

  const commandText = buildSkillCommand(workflow, action);
  const agentId = asString(params.agentId, 'manual');
  run.agentId = agentId;

  const provider = await getAgentProvider(agentId);
  if (!provider) {
    run.status = 'WAITING_FOR_AGENT';
    run.commandText = commandText;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      type: 'WARN',
      level: 'WARN',
      message: `未找到 Agent Provider: ${agentId}`,
      agentId,
      data: { commandText }
    });
    return run;
  }

  return executionMode(params) === 'TERMINAL'
    ? startAgentInTerminal(workspaceRoot, workflow, run, provider, commandText)
    : startAgentProcess(workspaceRoot, workflow, run, provider, commandText, onRunUpdate);
}

export const internalForTests = {
  buildSkillCommand,
  isAgentAction
};
