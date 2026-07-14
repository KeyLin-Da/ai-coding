import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { ActionInput, ExecutionMode, RunEvent, RunRecord, RunStatus } from '../../shared/workflow';
import { implementationStepForAction, stageForAction } from '../../shared/workflow';
import type { RequirementWorkflow } from '../../shared/workflow';
import type { MemoryRecallActionInput } from '../../shared/memory';
import { createRunId, appendRunEvent } from './run-log';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';
import {
  beginCenterJobLease,
  finishCenterJobForRun,
  getAgentProvider,
  startAgentInTerminal,
  startAgentProcess
} from './agent-providers';
import {
  buildCenterJobCreatePayload,
  claimCenterJob,
  createCenterJob,
  type CenterRunnerConfig
} from './center-runner-adapter';
import { normalizePrdClarification } from './workflow-repository';
import { hasStagedTrackedChanges, readGitChanges } from './git-changes';
import { buildArtifactPublishEvents, captureControlledArtifactSnapshot } from './manual-artifact-sharing';
import { resolveWorkspaceOrRuntimePath } from './runtime-paths';
import { confirmMemoryRecallForRun } from './memory-recall-service';
import { prepareOpenSpecArtifactAction } from './open-spec-artifact-inputs';

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

function memoryRecallActionInput(action: ActionInput): MemoryRecallActionInput | undefined {
  const topLevel = action.memoryRecall;
  const nested = action.params?.memoryRecall;
  const value = topLevel || (typeof nested === 'object' && nested ? nested as MemoryRecallActionInput : undefined);
  return value && typeof value === 'object' ? value : undefined;
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

function defaultPrdAnalysisPath(workflow: RequirementWorkflow): string {
  return `docs/${normalizeRequirementId(workflow.requirementId)}/prd/analysis.md`;
}

function validationError(message: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = 'VALIDATION_ERROR';
  return error;
}

export async function assertPrdClarificationReady(workspaceRoot: string, workflow: RequirementWorkflow, action: ActionInput): Promise<void> {
  if (action.actionType !== 'PRD_CLARIFY') {
    return;
  }
  if (workflow.requirementType === 'DEFECT') {
    throw validationError('缺陷类型不支持 PRD 澄清');
  }
  const description = normalizePrdClarification(typeof action.params?.description === 'string' ? action.params.description : '');
  if (!description) {
    throw validationError('请输入 PRD 澄清描述');
  }
  const documentPath = defaultPrdAnalysisPath(workflow);
  const absolutePath = assertInsideWorkspace(workspaceRoot, documentPath);
  try {
    await fs.access(absolutePath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw validationError('请先生成 PRD 文档，再发起 PRD 澄清');
    }
    throw error;
  }
}

function openSpecPrdDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const explicitPath = asString(params.prdDocumentPath);
  if (explicitPath) {
    return explicitPath;
  }
  return prdDocumentPath(workflow, params);
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

function consumedTechDesignQuestionPathSet(workflow: RequirementWorkflow): Set<string> {
  return new Set((workflow.techDesignConsumedQuestionPaths || []).map((item) => item.replace(/\\/g, '/')));
}

function isConsumedTechDesignQuestionPath(workflow: RequirementWorkflow, filePath: string): boolean {
  return consumedTechDesignQuestionPathSet(workflow).has(filePath.replace(/\\/g, '/'));
}

function existingTechDesignQuestionPaths(workflow: RequirementWorkflow): string[] {
  const legacyPath = legacyTechDesignQuestionPath(workflow.requirementId);
  const questionPrefix = `docs/${normalizeRequirementId(workflow.requirementId)}/technical-design/questions/`;
  const consumedQuestionPaths = consumedTechDesignQuestionPathSet(workflow);
  return workflow.artifacts
    .filter(
      (item) =>
        item.exists &&
        item.kind !== 'directory' &&
        (item.id === 'technical-design-questions' || item.path === legacyPath || item.path.replace(/\\/g, '/').startsWith(questionPrefix)) &&
        !consumedQuestionPaths.has(item.path.replace(/\\/g, '/'))
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
  const explicitPaths = asStringArray(params.sourceFiles).filter((filePath) => !isTechnicalDesignQuestionPath(workflow, filePath) || !isConsumedTechDesignQuestionPath(workflow, filePath));
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

function existingTechnicalDesignDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const explicitPath = asString(params.designDocumentPath);
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
  return '';
}

function designInputParam(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const existingDesignDocument = existingTechnicalDesignDocumentPath(workflow, params);
  if (workflow.requirementType === 'DEFECT') {
    const explicitClarification = hasParam(params, 'clarification') ? asString(params.clarification) : '';
    const clarification = explicitClarification || workflow.techDesignClarification || '';
    return uniqueNonEmpty([workflow.title, clarification, existingDesignDocument, ...techDesignSourcePaths(workflow, params)]).join(',');
  }
  return uniqueNonEmpty([prdDocumentPath(workflow, params), existingDesignDocument, ...techDesignSourcePaths(workflow, params)]).join(',');
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
  return uniqueNonEmpty([prdDocumentPath(workflow, params), technicalDesignDocumentPath(workflow, params)]).join(',');
}

function openSpecInputParam(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const versionContextPath = asString(params.openSpecArtifactContextPath);
  if (workflow.requirementType === 'DEFECT') {
    return uniqueNonEmpty([technicalDesignDocumentPath(workflow, params), versionContextPath, ...techDesignSourcePaths(workflow, params)]).join(',');
  }
  return uniqueNonEmpty([
    openSpecPrdDocumentPath(workflow, params),
    technicalDesignDocumentPath(workflow, params),
    versionContextPath,
    `docs/${requirementId}/prd/files`,
    ...asStringArray(params.sourceFiles)
  ]).join(',');
}

function projectParam(workflow: RequirementWorkflow): string {
  return (workflow.projects || []).map((project) => project.name || project.path).filter(Boolean).join(',');
}

function reviewModeParam(params: Record<string, unknown>): 'commit' | 'staged' {
  return params.reviewMode === 'staged' ? 'staged' : 'commit';
}

function retrospectiveScopeParam(params: Record<string, unknown>): string {
  const scope = asString(params.scope || params.evidenceScope, 'auto');
  return scope || 'auto';
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
    case 'PRD_CLARIFY':
      return `/coding-prd-analyzer id=${requirementId} c=${description || '<clarification>'}`;
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
    case 'RETROSPECTIVE_GENERATE':
      return [
        `/coding-retrospective r=${requirementId}`,
        projects ? `p=${projects}` : '',
        branchName ? `b=${branchName}` : '',
        clarification ? `c=${clarification}` : '',
        `s=${retrospectiveScopeParam(params)}`
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
  return [
    'PRD_ANALYZE',
    'PRD_CLARIFY',
    'DESIGN_GENERATE',
    'DESIGN_QUESTION',
    'OPENSPEC_FF',
    'OPENSPEC_APPLY',
    'OPENSPEC_VERIFY',
    'OPENSPEC_ARCHIVE',
    'JUNIT_GENERATE',
    'CODE_REVIEW',
    'RETROSPECTIVE_GENERATE'
  ].includes(actionType);
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
    for (const key of ['documentPath', 'prdDocumentPath', 'designDocumentPath', 'artifactPath', 'outputPath', 'openSpecArtifactContextPath']) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        assertInsideWorkspace(workspaceRoot, value);
      }
    }
    for (const value of asStringArray(params.sourceFiles)) {
      resolveWorkspaceOrRuntimePath(workspaceRoot, value);
    }
  }
  const allowed = new Set<ActionInput['actionType']>([
    'PRD_ANALYZE',
    'PRD_CLARIFY',
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
    'RETROSPECTIVE_GENERATE',
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
  options: { projectPaths?: string[]; centerConfig?: CenterRunnerConfig; projectId?: string } = {}
): Promise<RunRecord> {
  let normalizedAction =
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
  await assertPrdClarificationReady(workspaceRoot, workflow, normalizedAction);
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
    executionMode: executionMode(params),
    techDesignInputSnapshot: normalizedAction.techDesignInputSnapshot,
    openSpecArtifactInputSnapshot: normalizedAction.openSpecArtifactInputSnapshot
  };
  if (normalizedAction.actionType === 'OPENSPEC_FF') {
    normalizedAction = await prepareOpenSpecArtifactAction(workspaceRoot, workflow, normalizedAction);
    run.params = normalizedAction.params || {};
    run.openSpecArtifactInputSnapshot = normalizedAction.openSpecArtifactInputSnapshot;
  }
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

  if (normalizedAction.actionType === 'DESIGN_GENERATE') {
    const memoryRecall = memoryRecallActionInput(normalizedAction);
    if (memoryRecall?.enabled) {
      try {
        const recall = await confirmMemoryRecallForRun(workspaceRoot, workflow, {
          projectId: options.projectId,
          actionType: normalizedAction.actionType,
          stage: run.stage,
          runId: run.id,
          previewId: memoryRecall.previewId,
          selectedMemoryIds: memoryRecall.selectedMemoryIds || [],
          dismissed: memoryRecall.dismissed || [],
          force: memoryRecall.force,
          sourceFilePaths: asStringArray(normalizedAction.params?.sourceFiles),
          clarification: asString(normalizedAction.params?.clarification),
          runIntent: '生成技术方案'
        });
        if (recall.recallPath) {
          const sourceFiles = asStringArray(normalizedAction.params?.sourceFiles);
          normalizedAction = {
            ...normalizedAction,
            params: {
              ...(normalizedAction.params || {}),
              sourceFiles: uniqueNonEmpty([...sourceFiles, recall.recallPath])
            }
          };
          run.params = normalizedAction.params || {};
          await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
            type: 'INFO',
            level: 'INFO',
            message: `已召回项目记忆: ${recall.recallPath}`,
            data: { recallPath: recall.recallPath, memoryCount: recall.records.length }
          });
        }
      } catch (error: any) {
        await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
          type: 'WARN',
          level: 'WARN',
          message: `项目记忆召回确认失败，已跳过本次反哺：${error?.message || 'unknown error'}`
        });
      }
    } else if (memoryRecall?.enabled === false) {
      await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: 'INFO',
        level: 'INFO',
        message: '用户未启用项目记忆召回，本次生成不注入项目记忆'
      });
    }
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

  if (provider.id === 'codex' && workflow.id && options.centerConfig) {
    try {
      const centerJob = await createCenterJob(
        options.centerConfig,
        buildCenterJobCreatePayload(workflow, normalizedAction, run.id)
      );
      const claimedJob = await claimCenterJob(options.centerConfig, centerJob.id);
      if (!claimedJob.runId) {
        throw new Error('中心服务未返回 Run ID');
      }
      run.centerJobId = claimedJob.id;
      run.centerRunId = claimedJob.runId;
      await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: 'INFO',
        level: 'INFO',
        message: `已建立 Center Run 映射: ${claimedJob.runId}`,
        agentId,
        data: {
          kind: 'CENTER_RUN_MAPPED',
          centerJobId: claimedJob.id,
          centerRunId: claimedJob.runId
        }
      });
      beginCenterJobLease(run, options.centerConfig);
    } catch (error: any) {
      run.status = 'FAILED';
      run.error = `无法建立 Center Run，已阻止 Codex 启动：${error?.message || 'unknown error'}`;
      run.finishedAt = new Date().toISOString();
      await appendRunEvent(workspaceRoot, workflow.requirementId, run.id, {
        type: 'ERROR',
        level: 'ERROR',
        message: run.error,
        agentId
      });
      return run;
    }
  }

  const onRunUpdateWithArtifacts = async (updatedRun: RunRecord) => {
    if (
      updatedRun.centerJobId
      && options.centerConfig
      && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'COMPLETED'].includes(updatedRun.status)
      && !updatedRun.centerSyncedAt
    ) {
      try {
        await finishCenterJobForRun(updatedRun, options.centerConfig);
        updatedRun.centerSyncedAt = new Date().toISOString();
      } catch {
        // 状态保留为未同步，后续需求刷新会继续补偿。
      }
    }
    await appendChangedArtifactEvents(updatedRun);
    await onRunUpdate(updatedRun);
  };
  if (['TERMINAL', 'INTERACTIVE_TERMINAL'].includes(executionMode(params))) {
    const terminalRun = await startAgentInTerminal(
      workspaceRoot,
      workflow,
      run,
      provider,
      commandText,
      projectPaths,
      options.centerConfig
    );
    if (['FAILED', 'CANCELLED'].includes(terminalRun.status)) {
      await onRunUpdateWithArtifacts(terminalRun);
    }
    return terminalRun;
  }
  return startAgentProcess(
    workspaceRoot,
    workflow,
    run,
    provider,
    commandText,
    onRunUpdateWithArtifacts,
    projectPaths,
    options.centerConfig
  );
}

export const internalForTests = {
  buildSkillCommand,
  existingTechDesignQuestionPaths,
  isTechnicalDesignQuestionPath,
  isAgentAction,
  runCli
};
