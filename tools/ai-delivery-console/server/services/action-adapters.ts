import { spawn } from 'node:child_process';
import type { ActionInput, ExecutionMode, RunEvent, RunRecord, RunStatus } from '../../shared/workflow';
import { implementationStepForAction, stageForAction } from '../../shared/workflow';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createRunId, appendRunEvent } from './run-log';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';
import { getAgentProvider, startAgentInTerminal, startAgentProcess } from './agent-providers';
import { normalizePrdClarification } from './workflow-repository';
import { hasStagedTrackedChanges, readGitChanges } from './git-changes';
import { buildArtifactPublishEvents, captureControlledArtifactSnapshot } from './manual-artifact-sharing';

const cliActionMap: Partial<Record<ActionInput['actionType'], string[]>> = {
  OPENSPEC_STATUS: ['openspec', 'status'],
  OPENSPEC_NEW_CHANGE: ['openspec', 'new', 'change'],
  OPENSPEC_INSTRUCTIONS: ['openspec', 'instructions']
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function hasParam(params: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function executionMode(params: Record<string, unknown>): ExecutionMode {
  if (params.executionMode === 'TERMINAL' || params.executionMode === 'INTERACTIVE_TERMINAL') {
    return params.executionMode;
  }
  return 'BACKGROUND';
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

function openSpecPrdDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const explicitPath = asString(params.prdDocumentPath);
  if (explicitPath) {
    return explicitPath;
  }
  const artifactPath = workflow.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path;
  return artifactPath || workflow.stages.PRD.artifactPath || `docs/${workflow.requirementId}/prd/analysis.md`;
}

function slugText(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'question'
  );
}

function techDesignQuestionPath(requirementId: string, question = ''): string {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`;
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/questions/${stamp}-${slugText(question)}.md`;
}

function legacyTechDesignQuestionPath(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/technical-design/questions.md`;
}

function isTechnicalDesignSourcePath(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').includes('/technical-design/file/');
}

function isTechnicalDesignQuestionPath(workflow: RequirementWorkflow, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized === legacyTechDesignQuestionPath(workflow.requirementId) || normalized.startsWith(`docs/${normalizeRequirementId(workflow.requirementId)}/technical-design/questions/`);
}

function existingTechDesignQuestionPaths(workflow: RequirementWorkflow): string[] {
  const legacyPath = legacyTechDesignQuestionPath(workflow.requirementId);
  const questionPrefix = `docs/${normalizeRequirementId(workflow.requirementId)}/technical-design/questions/`;
  return workflow.artifacts
    .filter(
      (item) =>
        item.exists &&
        item.kind !== 'directory' &&
        (item.id === 'technical-design-questions' || item.path === legacyPath || item.path.replace(/\\/g, '/').startsWith(questionPrefix))
    )
    .map((item) => item.path)
    .sort((left, right) => {
      const leftLegacy = left === legacyPath;
      const rightLegacy = right === legacyPath;
      if (leftLegacy !== rightLegacy) {
        return leftLegacy ? 1 : -1;
      }
      return left.localeCompare(right);
    });
}

function techDesignSourcePaths(workflow: RequirementWorkflow, params: Record<string, unknown>): string[] {
  const explicitPaths = asStringArray(params.sourceFiles);
  const questionPaths = existingTechDesignQuestionPaths(workflow);
  if (explicitPaths.length) {
    return uniqueNonEmpty([...questionPaths, ...explicitPaths]);
  }
  return uniqueNonEmpty([...questionPaths, ...(workflow.techDesignSourceFiles || []).map((file) => file.path).filter(Boolean)]);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function designInputParam(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  if (workflow.requirementType === 'DEFECT') {
    const explicitClarification = hasParam(params, 'clarification') ? asString(params.clarification) : '';
    const clarification = explicitClarification || workflow.techDesignClarification || '';
    return uniqueNonEmpty([workflow.title, clarification, ...techDesignSourcePaths(workflow, params)]).join(',');
  }
  return [prdDocumentPath(workflow, params), ...techDesignSourcePaths(workflow, params)].filter(Boolean).join(',');
}

function technicalDesignDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const explicitPath = asString(params.designDocumentPath) || asString(params.documentPath);
  if (explicitPath) {
    return explicitPath;
  }
  const defaultPath = `docs/${normalizeRequirementId(workflow.requirementId)}/technical-design/design_review.md`;
  const officialArtifact = workflow.artifacts.find(
    (artifact) => artifact.exists && artifact.kind !== 'directory' && (artifact.id === 'technical-design' || artifact.path === defaultPath)
  );
  if (officialArtifact) {
    return officialArtifact.path;
  }
  const artifactPath = workflow.stages.TECH_DESIGN.artifactPath?.trim();
  if (artifactPath && !isTechnicalDesignSourcePath(artifactPath) && !isTechnicalDesignQuestionPath(workflow, artifactPath)) {
    return artifactPath;
  }
  return defaultPath;
}

function designQuestionInputParam(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  if (workflow.requirementType === 'DEFECT') {
    return technicalDesignDocumentPath(workflow, params);
  }
  return uniqueNonEmpty([openSpecPrdDocumentPath(workflow, params), technicalDesignDocumentPath(workflow, params)]).join(',');
}

function openSpecInputParam(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  if (workflow.requirementType === 'DEFECT') {
    return uniqueNonEmpty([technicalDesignDocumentPath(workflow, params), ...techDesignSourcePaths(workflow, params)]).join(',');
  }
  return [
    openSpecPrdDocumentPath(workflow, params),
    technicalDesignDocumentPath(workflow, params),
    `docs/${requirementId}/prd/files`
  ].filter(Boolean).join(',');
}

function projectParam(workflow: RequirementWorkflow): string {
  return (workflow.projects || []).map((project) => project.name || project.path).filter(Boolean).join(',');
}

function reviewModeParam(params: Record<string, unknown>): 'commit' | 'staged' {
  return params.reviewMode === 'staged' ? 'staged' : 'commit';
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
  const question = asString(params.question, '<question>');
  const outputPath = asString(params.outputPath, techDesignQuestionPath(requirementId, question));
  const projects = projectParam(workflow);
  const reviewMode = reviewModeParam(params);

  switch (action.actionType) {
    case 'PRD_ANALYZE':
      return `/coding-prd-analyzer id=${requirementId}${prdClarification ? ` c=${prdClarification}` : ''}${sources ? ` ${sources}` : ''}`;
    case 'DESIGN_GENERATE':
      return `/coding-design d=${designInputParam(workflow, params)} r=${requirementId}${projects ? ` p=${projects}` : ''}${clarification ? ` c=${clarification}` : ''}`;
    case 'DESIGN_QUESTION':
      return `/coding-design-question r=${requirementId} q=${question} d=${designQuestionInputParam(workflow, params)}${projects ? ` p=${projects}` : ''} o=${outputPath}`;
    case 'JUNIT_GENERATE':
      return `generate-unit-test ${moduleName || '<module-name>'}${description ? ` "${description}"` : ''}`;
    case 'CODE_REVIEW':
      return [
        `/coding-review r=${requirementId}`,
        `p=${projects || '<project-list>'}`,
        `m=${reviewMode}`,
        reviewMode === 'commit' ? `b=${branchName || '<branch-name>'}` : '',
        params.docs ? `d=${params.docs}` : ''
      ]
        .filter(Boolean)
        .join(' ');
    case 'OPENSPEC_FF':
      return `/openspec-ff-change ${changeName} d=${openSpecInputParam(workflow, params)}`;
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
  return ['PRD_ANALYZE', 'DESIGN_GENERATE', 'DESIGN_QUESTION', 'OPENSPEC_FF', 'OPENSPEC_APPLY', 'OPENSPEC_VERIFY', 'OPENSPEC_ARCHIVE', 'JUNIT_GENERATE', 'CODE_REVIEW'].includes(actionType);
}

async function ensureStagedReviewHasChanges(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  params: Record<string, unknown>,
  run: RunRecord,
  projectPaths: string[] = []
): Promise<boolean> {
  if (run.actionType !== 'CODE_REVIEW' || reviewModeParam(params) !== 'staged') {
    return true;
  }
  try {
    const summary = await readGitChanges(workspaceRoot, workflow.projects || [], workflow.branchName, projectPaths);
    if (hasStagedTrackedChanges(summary)) {
      return true;
    }
    run.error = '暂存区没有已暂存文件，请先 git add 后再执行暂存区预审';
  } catch (error: any) {
    run.error = error.message || '读取暂存区变更失败';
  }
  run.status = 'FAILED';
  run.finishedAt = new Date().toISOString();
  await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
    type: 'WARN',
    level: 'WARN',
    message: run.error || '暂存区预审已拦截'
  });
  return false;
}

function runCli(
  workspaceRoot: string,
  args: string[],
  onEvent: (event: Omit<RunEvent, 'time'>) => Promise<void> = async () => undefined
): Promise<{ status: RunStatus; output: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: workspaceRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const pendingEvents: Promise<void>[] = [];
    const emit = (event: Omit<RunEvent, 'time'>) => {
      pendingEvents.push(onEvent(event).catch(() => undefined));
    };
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      emit({
        type: 'STDOUT',
        level: 'INFO',
        message: text.trimEnd() || 'stdout',
        text
      });
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      emit({
        type: 'STDERR',
        level: 'WARN',
        message: text.trimEnd() || 'stderr',
        text
      });
    });
    child.on('error', async (error) => {
      await Promise.allSettled(pendingEvents);
      resolve({ status: 'FAILED', output: stdout, error: error.message });
    });
    child.on('close', async (code) => {
      await Promise.allSettled(pendingEvents);
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
    for (const key of ['documentPath', 'prdDocumentPath', 'designDocumentPath', 'artifactPath', 'outputPath']) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        assertInsideWorkspace(workspaceRoot, value);
      }
    }
    for (const value of asStringArray(params.sourceFiles)) {
      assertInsideWorkspace(workspaceRoot, value);
    }
  }
  const allowed = new Set<ActionInput['actionType']>([
    'PRD_ANALYZE',
    'DESIGN_GENERATE',
    'DESIGN_QUESTION',
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
  onRunUpdate: (run: RunRecord) => Promise<void> = async () => undefined,
  options: { projectPaths?: string[] } = {}
): Promise<RunRecord> {
  const normalizedAction =
    action.actionType === 'DESIGN_QUESTION' && !asString(action.params?.outputPath)
      ? {
          ...action,
          params: {
            ...(action.params || {}),
            outputPath: techDesignQuestionPath(workflow.requirementId, asString(action.params?.question))
          }
        }
      : action;
  validateActionInput(workspaceRoot, normalizedAction);
  const runId = createRunId();
  const params = normalizedAction.params || {};
  const startedAt = new Date().toISOString();
  const run: RunRecord = {
    id: runId,
    requirementId: workflow.requirementId,
    actionType: normalizedAction.actionType,
    stage: stageForAction(normalizedAction.actionType),
    implementationStep: implementationStepForAction(normalizedAction.actionType),
    status: 'RUNNING',
    startedAt,
    params,
    executionMode: executionMode(params)
  };
  const artifactSnapshot = await captureControlledArtifactSnapshot(workspaceRoot, workflow);

  async function appendChangedArtifactEvents(updatedRun: RunRecord): Promise<void> {
    if (!['SUCCEEDED', 'FAILED', 'CANCELLED', 'COMPLETED'].includes(updatedRun.status)) {
      return;
    }
    const artifactEvents = await buildArtifactPublishEvents(workspaceRoot, workflow, updatedRun, artifactSnapshot);
    for (const event of artifactEvents) {
      await appendRunEvent(workspaceRoot, workflow.requirementId, updatedRun.id, event);
    }
  }

  await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
    type: 'START',
    level: 'INFO',
    message: `开始执行 ${normalizedAction.actionType}`
  });

  if (normalizedAction.actionType === 'RETURN_TO_IMPLEMENTATION' || normalizedAction.actionType === 'REFRESH_ARTIFACTS') {
    run.status = 'SUCCEEDED';
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      type: 'INFO',
      level: 'INFO',
      message: '本地状态动作已完成'
    });
    await appendChangedArtifactEvents(run);
    return run;
  }

  const cliBase = cliActionMap[normalizedAction.actionType];
  if (cliBase) {
    const changeName = asString(params.changeName, `req-${workflow.requirementId}`);
    const artifactId = asString(params.artifactId, 'proposal');
    const args =
      normalizedAction.actionType === 'OPENSPEC_STATUS'
        ? [...cliBase, '--change', changeName, '--json']
        : normalizedAction.actionType === 'OPENSPEC_NEW_CHANGE'
          ? [...cliBase, changeName]
          : [...cliBase, artifactId, '--change', changeName, '--json'];
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      type: 'INFO',
      level: 'INFO',
      message: `执行命令: ${args.join(' ')}`
    });
    const result = await runCli(workspaceRoot, args, (event) => appendRunEvent(workspaceRoot, workflow.requirementId, runId, event));
    run.status = result.status;
    run.error = result.error;
    run.finishedAt = new Date().toISOString();
    await appendRunEvent(workspaceRoot, workflow.requirementId, runId, {
      type: result.status === 'SUCCEEDED' ? 'EXIT' : 'ERROR',
      level: result.status === 'SUCCEEDED' ? 'INFO' : 'ERROR',
      message: result.status === 'SUCCEEDED' ? 'OpenSpec 命令执行完成' : 'OpenSpec 命令执行失败',
      data: { output: result.output, error: result.error }
    });
    await appendChangedArtifactEvents(run);
    return run;
  }

  if (!isAgentAction(normalizedAction.actionType)) {
    run.status = 'FAILED';
    run.error = `动作未实现: ${normalizedAction.actionType}`;
    run.finishedAt = new Date().toISOString();
    return run;
  }

  const projectPaths = options.projectPaths || [];
  if (!(await ensureStagedReviewHasChanges(workspaceRoot, workflow, params, run, projectPaths))) {
    return run;
  }

  const commandText = buildSkillCommand(workflow, normalizedAction);
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

  const onRunUpdateWithArtifacts = async (updatedRun: RunRecord) => {
    await appendChangedArtifactEvents(updatedRun);
    await onRunUpdate(updatedRun);
  };
  return ['TERMINAL', 'INTERACTIVE_TERMINAL'].includes(executionMode(params))
    ? startAgentInTerminal(workspaceRoot, workflow, run, provider, commandText, projectPaths)
    : startAgentProcess(workspaceRoot, workflow, run, provider, commandText, onRunUpdateWithArtifacts, projectPaths);
}

export const internalForTests = {
  buildSkillCommand,
  isAgentAction,
  runCli
};
