import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AiCodeCompletenessInput,
  AiCodeCompletenessProjectCommit,
  AiCodeCompletenessProjectMetrics,
  AiCodeCompletenessResult,
  AiCodeCompletenessState,
  AiCodeCompletenessSummary,
  RequirementWorkflow,
  WorkflowProject
} from '../../shared/workflow';
import { normalizeRequirementId } from './workspace';
import { resolveWorkflowProjects, type ResolvedWorkflowProject } from './project-resolver';

interface GitRunResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface NumstatSummary {
  additions: number;
  deletions: number;
  changeLines: number;
  files: Set<string>;
}

export function aiCodeCompletenessDir(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/metrics`;
}

export function aiCodeCompletenessDataPath(requirementId: string): string {
  return `${aiCodeCompletenessDir(requirementId)}/ai-code-completeness.json`;
}

export function aiCodeCompletenessReportPath(requirementId: string): string {
  return `${aiCodeCompletenessDir(requirementId)}/ai-code-completeness.md`;
}

function runGit(cwd: string, args: string[], allowFailure = false): Promise<GitRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
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
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { stdout, stderr, code: code ?? 1 };
      if (result.code === 0 || allowFailure) {
        resolve(result);
        return;
      }
      reject(new Error(stderr.trim() || `git ${args.join(' ')} 退出码: ${result.code}`));
    });
  });
}

function normalizeCommit(value?: string): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function normalizeRemoteBranchName(value: string | undefined, remote: string): string | undefined {
  let normalized = String(value || '').trim();
  if (!normalized) {
    return undefined;
  }
  normalized = normalized.replace(/^refs\/heads\//, '');
  const remoteRefPrefix = `refs/remotes/${remote}/`;
  if (normalized.startsWith(remoteRefPrefix)) {
    normalized = normalized.slice(remoteRefPrefix.length);
  }
  const remotePrefix = `${remote}/`;
  if (normalized.startsWith(remotePrefix)) {
    normalized = normalized.slice(remotePrefix.length);
  }
  return normalized || undefined;
}

function shortCommit(value?: string): string {
  return value ? value.slice(0, 12) : '-';
}

function percent(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '-';
}

export function calculateSummary(projects: AiCodeCompletenessProjectMetrics[]): AiCodeCompletenessSummary {
  const totals = projects.reduce(
    (acc, project) => ({
      aiAdditions: acc.aiAdditions + project.aiAdditions,
      aiDeletions: acc.aiDeletions + project.aiDeletions,
      aiChangeLines: acc.aiChangeLines + project.aiChangeLines,
      followUpAdditions: acc.followUpAdditions + project.followUpAdditions,
      followUpDeletions: acc.followUpDeletions + project.followUpDeletions,
      followUpChangeLines: acc.followUpChangeLines + project.followUpChangeLines
    }),
    {
      aiAdditions: 0,
      aiDeletions: 0,
      aiChangeLines: 0,
      followUpAdditions: 0,
      followUpDeletions: 0,
      followUpChangeLines: 0
    }
  );

  const aiChangedFiles = projects.reduce((sum, project) => sum + project.aiChangedFiles, 0);
  const followUpChangedFiles = projects.reduce((sum, project) => sum + project.followUpChangedFiles, 0);
  const stableAiFiles = projects.reduce((sum, project) => sum + project.stableAiFiles, 0);
  const denominator = totals.aiChangeLines + totals.followUpChangeLines;
  return {
    ...totals,
    aiChangedFiles,
    followUpChangedFiles,
    stableAiFiles,
    completenessRate: denominator > 0 ? (totals.aiChangeLines / denominator) * 100 : undefined,
    followUpAdjustmentRate: totals.aiChangeLines > 0 ? (totals.followUpChangeLines / totals.aiChangeLines) * 100 : undefined,
    aiFileStabilityRate: aiChangedFiles > 0 ? (stableAiFiles / aiChangedFiles) * 100 : undefined
  };
}

function parseNumstat(content: string): NumstatSummary {
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;
  for (const line of content.split('\n').filter(Boolean)) {
    const [additionsRaw, deletionsRaw, ...pathParts] = line.split('\t');
    const filePath = pathParts.join('\t');
    if (!filePath) {
      continue;
    }
    files.add(filePath.includes(' => ') ? filePath.split(' => ').pop()?.replace(/[{}]/g, '') || filePath : filePath);
    additions += additionsRaw === '-' ? 0 : Number(additionsRaw || 0);
    deletions += deletionsRaw === '-' ? 0 : Number(deletionsRaw || 0);
  }
  return {
    additions,
    deletions,
    changeLines: additions + deletions,
    files
  };
}

async function resolveCommit(rootPath: string, commit: string, field: string, projectName: string): Promise<string> {
  const result = await runGit(rootPath, ['rev-parse', '--verify', `${commit}^{commit}`], true);
  if (result.code !== 0) {
    throw new Error(`${projectName} 的 ${field} 不存在或不是有效 commit: ${commit}`);
  }
  return result.stdout.trim();
}

async function assertAncestor(rootPath: string, left: string, right: string, message: string): Promise<void> {
  const result = await runGit(rootPath, ['merge-base', '--is-ancestor', left, right], true);
  if (result.code !== 0) {
    throw new Error(message);
  }
}

async function readDiffSummary(rootPath: string, left: string, right: string): Promise<NumstatSummary> {
  const result = await runGit(rootPath, ['diff', '--numstat', left, right]);
  return parseNumstat(result.stdout);
}

async function selectRemote(rootPath: string, projectName: string): Promise<string> {
  const result = await runGit(rootPath, ['remote']);
  const remotes = result.stdout
    .split(/\r?\n/)
    .map((remote) => remote.trim())
    .filter(Boolean);
  if (remotes.includes('origin')) {
    return 'origin';
  }
  if (remotes.length) {
    return remotes[0];
  }
  throw new Error(`${projectName} 未配置 Git remote，无法自动获取远程分支 commit`);
}

async function resolveRemoteFinalCommit(
  rootPath: string,
  branchName: string | undefined,
  projectName: string
): Promise<{ branch: string; commit: string }> {
  const remote = await selectRemote(rootPath, projectName);
  const targetBranch = normalizeRemoteBranchName(branchName, remote);
  if (!targetBranch) {
    throw new Error(`${projectName} 缺少需求目标分支，无法自动获取远程分支 commit`);
  }
  const remoteRef = `refs/remotes/${remote}/${targetBranch}`;
  const fetchResult = await runGit(rootPath, ['fetch', remote, `+refs/heads/${targetBranch}:${remoteRef}`], true);
  if (fetchResult.code !== 0) {
    throw new Error(
      `${projectName} 获取远程分支 ${remote}/${targetBranch} 最新提交失败：${fetchResult.stderr.trim() || fetchResult.stdout.trim() || 'unknown error'}`
    );
  }
  const result = await runGit(rootPath, ['rev-parse', '--verify', `${remoteRef}^{commit}`], true);
  if (result.code !== 0) {
    throw new Error(`${projectName} 无法解析远程分支 ${remote}/${targetBranch} 的最新 commit`);
  }
  return {
    branch: `${remote}/${targetBranch}`,
    commit: result.stdout.trim()
  };
}

function existingCommitFor(projects: AiCodeCompletenessProjectCommit[] = [], project: WorkflowProject): AiCodeCompletenessProjectCommit | undefined {
  return projects.find((item) => item.projectPath === project.path || item.projectName === project.name || item.projectPath === project.name);
}

export async function buildAiCodeCompletenessState(
  workflow: RequirementWorkflow,
  projects: WorkflowProject[] = workflow.projects || []
): Promise<AiCodeCompletenessState> {
  const existing = workflow.aiCodeCompleteness;
  if (!projects.length && existing?.projects?.length) {
    return existing;
  }
  const nextProjects = projects.map((project) => {
    const previous = existingCommitFor(existing?.projects || [], project);
    return {
      projectName: project.name,
      projectPath: project.path,
      branch: previous?.branch,
      baseCommit: previous?.baseCommit,
      aiCommit: previous?.aiCommit,
      finalCommit: previous?.finalCommit,
      source: previous?.source,
      updatedAt: previous?.updatedAt,
      error: previous?.error
    };
  });
  const hasMissingCommit = nextProjects.some((project) => !project.baseCommit || !project.aiCommit);
  return {
    status: existing?.status === 'CALCULATED' && !hasMissingCommit ? 'CALCULATED' : hasMissingCommit ? 'NOT_READY' : 'READY',
    projects: nextProjects,
    summary: existing?.summary,
    calculatedAt: existing?.calculatedAt,
    reportPath: existing?.reportPath,
    dataPath: existing?.dataPath,
    error: hasMissingCommit ? undefined : existing?.error
  };
}

function mergeInputProjects(workflow: RequirementWorkflow, input: AiCodeCompletenessInput): WorkflowProject[] {
  const workflowProjects = workflow.projects || [];
  const projectByPath = new Map(workflowProjects.map((project) => [project.path, project]));
  return input.projects.map((project) => {
    const existing = projectByPath.get(project.projectPath);
    return {
      name: project.projectName || existing?.name || path.basename(project.projectPath),
      path: project.projectPath
    };
  });
}

async function calculateProjectMetrics(
  resolved: ResolvedWorkflowProject,
  input: AiCodeCompletenessInput['projects'][number],
  branchName: string | undefined
): Promise<AiCodeCompletenessProjectMetrics> {
  const projectName = resolved.project.name;
  const baseCommit = await resolveCommit(resolved.rootPath, normalizeCommit(input.baseCommit) || '', 'baseCommit', projectName);
  const aiCommit = await resolveCommit(resolved.rootPath, normalizeCommit(input.aiCommit) || '', 'aiCommit', projectName);
  const remoteFinal = await resolveRemoteFinalCommit(resolved.rootPath, branchName, projectName);
  const finalCommit = remoteFinal.commit;
  await assertAncestor(resolved.rootPath, baseCommit, aiCommit, `${projectName} 的 baseCommit 必须是 aiCommit 的祖先`);
  await assertAncestor(resolved.rootPath, aiCommit, finalCommit, `${projectName} 的 aiCommit 必须是 finalCommit 的祖先`);
  const [aiDiff, followUpDiff] = await Promise.all([
    readDiffSummary(resolved.rootPath, baseCommit, aiCommit),
    readDiffSummary(resolved.rootPath, aiCommit, finalCommit)
  ]);
  const stableAiFiles = [...aiDiff.files].filter((file) => !followUpDiff.files.has(file)).length;
  return {
    projectName,
    projectPath: resolved.project.path,
    branch: remoteFinal.branch,
    baseCommit,
    aiCommit,
    finalCommit,
    source: 'MANUAL',
    updatedAt: new Date().toISOString(),
    aiAdditions: aiDiff.additions,
    aiDeletions: aiDiff.deletions,
    aiChangeLines: aiDiff.changeLines,
    aiChangedFiles: aiDiff.files.size,
    followUpAdditions: followUpDiff.additions,
    followUpDeletions: followUpDiff.deletions,
    followUpChangeLines: followUpDiff.changeLines,
    followUpChangedFiles: followUpDiff.files.size,
    stableAiFiles,
    aiFileStabilityRate: aiDiff.files.size > 0 ? (stableAiFiles / aiDiff.files.size) * 100 : undefined
  };
}

function markdownReport(requirementId: string, result: AiCodeCompletenessResult): string {
  const summary = result.summary;
  const lines = [
    `# AI 代码完整度报告`,
    '',
    `- 需求号：${requirementId}`,
    `- 状态：${result.status}`,
    `- 计算时间：${result.calculatedAt || '-'}`,
    `- AI 完整度：${percent(summary?.completenessRate)}`,
    `- 后续调整率：${percent(summary?.followUpAdjustmentRate)}`,
    `- AI 文件稳定率：${percent(summary?.aiFileStabilityRate)}`,
    '',
    '## 汇总',
    '',
    '| 指标 | 数值 |',
    '| --- | ---: |',
    `| AI 首轮变更行数 | ${summary?.aiChangeLines ?? 0} |`,
    `| 后续调整行数 | ${summary?.followUpChangeLines ?? 0} |`,
    `| AI 涉及文件数 | ${summary?.aiChangedFiles ?? 0} |`,
    `| 后续调整文件数 | ${summary?.followUpChangedFiles ?? 0} |`,
    '',
    '## 工程明细',
    '',
    '| 工程 | baseCommit | aiCommit | finalCommit | AI变更 | 后续调整 | 文件稳定率 |',
    '| --- | --- | --- | --- | ---: | ---: | ---: |'
  ];
  for (const project of result.projects) {
    lines.push(
      `| ${project.projectName} | ${shortCommit(project.baseCommit)} | ${shortCommit(project.aiCommit)} | ${shortCommit(project.finalCommit)} | ${project.aiChangeLines} | ${project.followUpChangeLines} | ${percent(project.aiFileStabilityRate)} |`
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeResultFiles(workspaceRoot: string, requirementId: string, result: AiCodeCompletenessResult): Promise<void> {
  const dataPath = aiCodeCompletenessDataPath(requirementId);
  const reportPath = aiCodeCompletenessReportPath(requirementId);
  await fs.mkdir(path.join(workspaceRoot, aiCodeCompletenessDir(requirementId)), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, dataPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(workspaceRoot, reportPath), markdownReport(requirementId, result), 'utf8');
}

export async function calculateAiCodeCompleteness(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  input: AiCodeCompletenessInput,
  projectPaths: string[] = []
): Promise<{ state: AiCodeCompletenessState; result: AiCodeCompletenessResult }> {
  if (!input.projects?.length) {
    throw new Error('请至少维护一个涉及工程的 commit 信息');
  }
  for (const project of input.projects) {
    if (!normalizeCommit(project.baseCommit) || !normalizeCommit(project.aiCommit)) {
      throw new Error(`${project.projectName || project.projectPath} 缺少 baseCommit 或 aiCommit`);
    }
  }
  const resolvedProjects = await resolveWorkflowProjects(workspaceRoot, mergeInputProjects(workflow, input), projectPaths);
  const metrics = await Promise.all(
    resolvedProjects.map((resolved, index) => calculateProjectMetrics(resolved, input.projects[index], workflow.branchName))
  );
  const summary = calculateSummary(metrics);
  if (summary.aiChangeLines + summary.followUpChangeLines === 0) {
    throw new Error('baseCommit、aiCommit、远程最终提交之间没有可统计代码变更，无法计算完整度');
  }
  const now = new Date().toISOString();
  const dataPath = aiCodeCompletenessDataPath(workflow.requirementId);
  const reportPath = aiCodeCompletenessReportPath(workflow.requirementId);
  const result: AiCodeCompletenessResult = {
    requirementId: workflow.requirementId,
    status: 'CALCULATED',
    projects: metrics,
    summary,
    dataPath,
    reportPath,
    calculatedAt: now
  };
  await writeResultFiles(workspaceRoot, workflow.requirementId, result);
  return {
    result,
    state: {
      status: 'CALCULATED',
      projects: metrics.map((project) => ({
        projectName: project.projectName,
        projectPath: project.projectPath,
        branch: project.branch,
        baseCommit: project.baseCommit,
        aiCommit: project.aiCommit,
        finalCommit: project.finalCommit,
        source: project.source,
        updatedAt: project.updatedAt
      })),
      summary,
      dataPath,
      reportPath,
      calculatedAt: now
    }
  };
}

export async function assertProjectsCleanAndPushed(
  workspaceRoot: string,
  projects: WorkflowProject[],
  expectedBranch?: string,
  projectPaths: string[] = []
): Promise<AiCodeCompletenessProjectCommit[]> {
  if (!projects.length) {
    throw new Error('请先维护涉及工程，再审核查看变更文件及代码');
  }
  const resolvedProjects = await resolveWorkflowProjects(workspaceRoot, projects, projectPaths);
  const commits: AiCodeCompletenessProjectCommit[] = [];
  for (const resolved of resolvedProjects) {
    const [branchResult, statusResult, upstreamResult] = await Promise.all([
      runGit(resolved.rootPath, ['branch', '--show-current']),
      runGit(resolved.rootPath, ['status', '--porcelain', '--untracked-files=all']),
      runGit(resolved.rootPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], true)
    ]);
    const branch = branchResult.stdout.trim();
    if (expectedBranch && branch !== expectedBranch) {
      throw new Error(`${resolved.project.name} 当前分支 ${branch || '-'} 与期望分支 ${expectedBranch} 不一致`);
    }
    if (statusResult.stdout.trim()) {
      throw new Error(`${resolved.project.name} 存在未提交、暂存或未跟踪文件，请提交并 push 后再审核`);
    }
    if (upstreamResult.code !== 0 || !upstreamResult.stdout.trim()) {
      throw new Error(`${resolved.project.name} 当前分支未设置 upstream，请 push 后再审核`);
    }
    const aheadResult = await runGit(resolved.rootPath, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    const [, aheadRaw] = aheadResult.stdout.trim().split(/\s+/);
    if (Number(aheadRaw || 0) > 0) {
      throw new Error(`${resolved.project.name} 存在未推送提交，请 push 后再审核`);
    }
    const remoteCommit = await resolveRemoteFinalCommit(resolved.rootPath, expectedBranch || branch, resolved.project.name);
    commits.push({
      projectName: resolved.project.name,
      projectPath: resolved.project.path,
      branch: remoteCommit.branch,
      aiCommit: remoteCommit.commit,
      source: 'AUTO',
      updatedAt: new Date().toISOString()
    });
  }
  return commits;
}

export async function captureRemoteAiCommits(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  projectPaths: string[] = []
): Promise<AiCodeCompletenessState> {
  const projects = workflow.projects || [];
  if (!projects.length) {
    return workflow.aiCodeCompleteness || { status: 'NOT_READY', projects: [] };
  }
  const resolvedProjects = await resolveWorkflowProjects(workspaceRoot, projects, projectPaths);
  const captures = await Promise.all(
    resolvedProjects.map(async (resolved) => {
      const remoteCommit = await resolveRemoteFinalCommit(resolved.rootPath, workflow.branchName, resolved.project.name);
      return {
        projectName: resolved.project.name,
        projectPath: resolved.project.path,
        branch: remoteCommit.branch,
        aiCommit: remoteCommit.commit,
        source: 'AUTO' as const,
        updatedAt: new Date().toISOString()
      };
    })
  );
  return mergeAiCommitCaptures(workflow, captures);
}

export async function captureBaseCommits(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  projectPaths: string[] = []
): Promise<AiCodeCompletenessState> {
  const projects = workflow.projects || [];
  if (!projects.length) {
    return workflow.aiCodeCompleteness || { status: 'NOT_READY', projects: [] };
  }
  const resolvedProjects = await resolveWorkflowProjects(workspaceRoot, projects, projectPaths);
  const previous = workflow.aiCodeCompleteness?.projects || [];
  const now = new Date().toISOString();
  const nextProjects = await Promise.all(
    resolvedProjects.map(async (resolved) => {
      const existing = previous.find((item) => item.projectPath === resolved.project.path || item.projectName === resolved.project.name);
      const [headResult, branchResult] = await Promise.all([
        runGit(resolved.rootPath, ['rev-parse', 'HEAD']),
        runGit(resolved.rootPath, ['branch', '--show-current'])
      ]);
      return {
        projectName: resolved.project.name,
        projectPath: resolved.project.path,
        branch: existing?.branch || branchResult.stdout.trim(),
        baseCommit: existing?.baseCommit || headResult.stdout.trim(),
        aiCommit: existing?.aiCommit,
        finalCommit: existing?.finalCommit,
        source: existing?.source || 'AUTO',
        updatedAt: existing?.updatedAt || now
      };
    })
  );
  const hasMissingCommit = nextProjects.some((project) => !project.baseCommit || !project.aiCommit);
  return {
    ...(workflow.aiCodeCompleteness || {}),
    status: hasMissingCommit ? 'NOT_READY' : workflow.aiCodeCompleteness?.status || 'READY',
    projects: nextProjects,
    error: undefined
  };
}

export function mergeAiCommitCaptures(
  workflow: RequirementWorkflow,
  captures: AiCodeCompletenessProjectCommit[]
): AiCodeCompletenessState {
  const previous = workflow.aiCodeCompleteness?.projects || [];
  const nextProjects = captures.map((capture) => {
    const existing = previous.find((item) => item.projectPath === capture.projectPath || item.projectName === capture.projectName);
    return {
      projectName: capture.projectName,
      projectPath: capture.projectPath,
      branch: capture.branch,
      baseCommit: existing?.baseCommit,
      aiCommit: capture.aiCommit,
      finalCommit: existing?.finalCommit,
      source: existing?.aiCommit && existing.aiCommit !== capture.aiCommit ? 'MANUAL_OVERRIDE' : 'AUTO',
      updatedAt: capture.updatedAt
    };
  });
  const hasMissingCommit = nextProjects.some((project) => !project.baseCommit || !project.aiCommit);
  return {
    ...(workflow.aiCodeCompleteness || {}),
    status: hasMissingCommit ? 'NOT_READY' : workflow.aiCodeCompleteness?.status || 'READY',
    projects: nextProjects,
    error: undefined
  };
}
