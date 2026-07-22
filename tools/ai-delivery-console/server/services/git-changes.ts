import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  GitChangeSummary,
  GitChangedFile,
  GitDiffQueryInput,
  GitDiffPreview,
  GitFilePreview,
  GitProjectChangeSummary,
  GitStageUntrackedInput,
  WorkflowProject
} from '../../shared/workflow';
import { isInsideDirectory, resolveWorkflowProject, type ResolvedWorkflowProject } from './project-resolver';

const maxDiffLength = 120_000;
const maxPreviewFileSize = 1024 * 1024;
const allowedContextLines = new Set([3, 30, 100, 200]);

function runGit(cwd: string, args: string[]): Promise<string> {
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
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `git ${args.join(' ')} 退出码: ${code}`));
    });
  });
}

export function parseGitStatusShort(content: string): GitChangedFile[] {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawStatus = line.slice(0, 2);
      const rawPath = line.slice(3);
      const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() || rawPath : rawPath;
      return {
        path: filePath,
        status: rawStatus.trim() || rawStatus,
        staged: rawStatus[0] !== ' ' && rawStatus[0] !== '?',
        unstaged: rawStatus[1] !== ' ' || rawStatus[0] === '?'
      };
    });
}

function parseNumstat(content: string): Map<string, { additions: number; deletions: number }> {
  const stats = new Map<string, { additions: number; deletions: number }>();
  for (const line of content.split('\n').filter(Boolean)) {
    const [additionsRaw, deletionsRaw, ...pathParts] = line.split('\t');
    const filePath = pathParts.join('\t');
    if (!filePath) {
      continue;
    }
    const normalizedPath = filePath.includes(' => ') ? filePath.split(' => ').pop()?.replace(/[{}]/g, '') || filePath : filePath;
    const current = stats.get(normalizedPath) || { additions: 0, deletions: 0 };
    stats.set(normalizedPath, {
      additions: current.additions + (additionsRaw === '-' ? 0 : Number(additionsRaw || 0)),
      deletions: current.deletions + (deletionsRaw === '-' ? 0 : Number(deletionsRaw || 0))
    });
  }
  return stats;
}

function mergeStats(files: GitChangedFile[], ...statsMaps: Array<Map<string, { additions: number; deletions: number }>>): GitChangedFile[] {
  return files.map((file) => {
    const stat = statsMaps.reduce(
      (acc, stats) => {
        const item = stats.get(file.path);
        return item
          ? {
              additions: acc.additions + item.additions,
              deletions: acc.deletions + item.deletions
            }
          : acc;
      },
      { additions: 0, deletions: 0 }
    );
    return {
      ...file,
      additions: stat.additions,
      deletions: stat.deletions
    };
  });
}

function truncateDiffWithFlag(diff: string): { diff: string; truncated: boolean } {
  return diff.length > maxDiffLength
    ? {
        diff: `${diff.slice(0, maxDiffLength)}\n\n... diff 内容过长，已截断 ...\n`,
        truncated: true
      }
    : { diff, truncated: false };
}

function truncateDiff(diff: string): string {
  return truncateDiffWithFlag(diff).diff;
}

function normalizeGitRelativeFilePath(filePath: string): string {
  const normalized = String(filePath || '').trim().replace(/\\/g, '/');
  if (!normalized) {
    throw new Error('文件路径不能为空');
  }
  if (normalized.includes('\0')) {
    throw new Error(`文件路径不合法: ${filePath}`);
  }
  if (path.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`文件路径必须是相对路径: ${filePath}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`文件路径不合法: ${filePath}`);
  }
  return segments.join('/');
}

function normalizeStageFilePath(filePath: string): string {
  try {
    return normalizeGitRelativeFilePath(filePath);
  } catch (error: any) {
    if (String(error.message || '').includes('必须是相对路径')) {
      throw new Error(`待确认新文件路径必须是相对路径: ${filePath}`);
    }
    throw new Error(`待确认新文件路径不合法: ${filePath}`);
  }
}

async function resolveSelectedProject(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  projectPath: string,
  projectPaths: string[] = []
): Promise<ResolvedWorkflowProject> {
  if (!projects.length) {
    throw new Error('请先维护涉及工程，再查看变更文件及代码');
  }
  const normalizedProjectPath = String(projectPath || '').trim().replace(/\\/g, '/');
  if (!normalizedProjectPath) {
    throw new Error('缺少涉及工程');
  }
  const resolvedProjects = await Promise.all(projects.map((project) => resolveWorkflowProject(workspaceRoot, project, projectPaths)));
  const selected = resolvedProjects.find(
    (item) =>
      item.project.path === normalizedProjectPath ||
      item.project.name === normalizedProjectPath ||
      item.project.path.replace(/\\/g, '/') === normalizedProjectPath
  );
  if (!selected) {
    throw new Error(`涉及工程不在当前需求范围内: ${projectPath}`);
  }
  return selected;
}

function resolveProjectFilePath(projectRoot: string, filePath: string): { relativePath: string; absolutePath: string } {
  const relativePath = normalizeGitRelativeFilePath(filePath);
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (!isInsideDirectory(projectRoot, absolutePath)) {
    throw new Error(`文件路径不合法: ${filePath}`);
  }
  return { relativePath, absolutePath };
}

function normalizeContextLines(value?: number): number {
  const contextLines = Number(value || 3);
  return allowedContextLines.has(contextLines) ? contextLines : 3;
}

function languageForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languages: Record<string, string> = {
    '.java': 'java',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.vue': 'vue',
    '.json': 'json',
    '.md': 'markdown',
    '.xml': 'xml',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.sql': 'sql',
    '.txt': 'text'
  };
  return languages[ext] || ext.replace(/^\./, '') || 'text';
}

function hasBinaryMarker(content: Buffer): boolean {
  return content.subarray(0, Math.min(content.length, 8000)).includes(0);
}

async function readProjectGitChanges(
  workspaceRoot: string,
  project: WorkflowProject,
  expectedBranch?: string,
  projectPaths: string[] = []
): Promise<GitProjectChangeSummary> {
  let projectRoot = '';
  let projectRef = {
    name: project.name || path.basename(project.path),
    path: project.path
  };
  try {
    const resolved = await resolveWorkflowProject(workspaceRoot, project, projectPaths);
    projectRoot = resolved.rootPath;
    projectRef = resolved.project;
    const [currentBranch, status, unstagedDiff, stagedDiff, unstagedNumstat, stagedNumstat] = await Promise.all([
      runGit(projectRoot, ['branch', '--show-current']),
      runGit(projectRoot, ['status', '--short', '--untracked-files=all']),
      runGit(projectRoot, ['diff', '--no-ext-diff']),
      runGit(projectRoot, ['diff', '--cached', '--no-ext-diff']),
      runGit(projectRoot, ['diff', '--numstat']),
      runGit(projectRoot, ['diff', '--cached', '--numstat'])
    ]);
    const statusFiles = parseGitStatusShort(status);
    const trackedFiles = statusFiles.filter((file) => file.status !== '??');
    const untrackedFiles = statusFiles.filter((file) => file.status === '??');
    const files = mergeStats(trackedFiles, parseNumstat(unstagedNumstat), parseNumstat(stagedNumstat));
    const diff = truncateDiff([stagedDiff, unstagedDiff].filter(Boolean).join('\n'));
    const additions = files.reduce((sum, file) => sum + (file.additions || 0), 0);
    const deletions = files.reduce((sum, file) => sum + (file.deletions || 0), 0);
    const branch = currentBranch.trim();
    return {
      project: projectRef,
      currentBranch: branch,
      expectedBranch,
      branchMatches: !expectedBranch || branch === expectedBranch,
      files,
      untrackedFiles,
      stagedDiff: truncateDiff(stagedDiff),
      unstagedDiff: truncateDiff(unstagedDiff),
      diff,
      additions,
      deletions
    };
  } catch (error: any) {
    return {
      project: projectRef,
      expectedBranch,
      branchMatches: false,
      files: [],
      untrackedFiles: [],
      stagedDiff: '',
      unstagedDiff: '',
      diff: '',
      additions: 0,
      deletions: 0,
      error: error.message || '读取 Git 变更失败'
    };
  }
}

export async function readGitChanges(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  expectedBranch?: string,
  projectPaths: string[] = []
): Promise<GitChangeSummary> {
  if (!projects.length) {
    throw new Error('请先维护涉及工程，再查看变更文件及代码');
  }
  const projectSummaries = await Promise.all(projects.map((project) => readProjectGitChanges(workspaceRoot, project, expectedBranch, projectPaths)));
  const files = projectSummaries.flatMap((summary) =>
    summary.files.map((file) => ({
      ...file,
      path: summary.project.path === '.' ? file.path : `${summary.project.path}/${file.path}`
    }))
  );
  const untrackedFiles = projectSummaries.flatMap((summary) =>
    summary.untrackedFiles.map((file) => ({
      ...file,
      path: summary.project.path === '.' ? file.path : `${summary.project.path}/${file.path}`
    }))
  );
  const diff = projectSummaries.map((summary) => summary.diff).filter(Boolean).join('\n');
  return {
    updatedAt: new Date().toISOString(),
    files,
    untrackedFiles,
    diff: truncateDiff(diff),
    projects: projectSummaries,
    additions: projectSummaries.reduce((sum, summary) => sum + summary.additions, 0),
    deletions: projectSummaries.reduce((sum, summary) => sum + summary.deletions, 0)
  };
}

export async function readGitDiffPreview(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  input: GitDiffQueryInput,
  projectPaths: string[] = []
): Promise<GitDiffPreview> {
  const selected = await resolveSelectedProject(workspaceRoot, projects, input.projectPath, projectPaths);
  const contextLines = normalizeContextLines(input.contextLines);
  const filePath = input.filePath ? resolveProjectFilePath(selected.rootPath, input.filePath).relativePath : undefined;
  const scopedPathArgs = filePath ? ['--', filePath] : [];
  const [status, unstagedDiff, stagedDiff, unstagedNumstat, stagedNumstat] = await Promise.all([
    runGit(selected.rootPath, ['status', '--short', '--untracked-files=all']),
    runGit(selected.rootPath, ['diff', '--no-ext-diff', `--unified=${contextLines}`, ...scopedPathArgs]),
    runGit(selected.rootPath, ['diff', '--cached', '--no-ext-diff', `--unified=${contextLines}`, ...scopedPathArgs]),
    runGit(selected.rootPath, ['diff', '--numstat', ...scopedPathArgs]),
    runGit(selected.rootPath, ['diff', '--cached', '--numstat', ...scopedPathArgs])
  ]);
  const trackedFiles = parseGitStatusShort(status)
    .filter((file) => file.status !== '??')
    .filter((file) => !filePath || file.path === filePath);
  const files = mergeStats(trackedFiles, parseNumstat(unstagedNumstat), parseNumstat(stagedNumstat));
  const result = truncateDiffWithFlag([stagedDiff, unstagedDiff].filter(Boolean).join('\n'));
  return {
    projectPath: selected.project.path,
    filePath,
    contextLines,
    diff: result.diff,
    truncated: result.truncated,
    files
  };
}

export async function readGitChangedFilePreview(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  input: GitDiffQueryInput,
  projectPaths: string[] = []
): Promise<GitFilePreview> {
  const selected = await resolveSelectedProject(workspaceRoot, projects, input.projectPath, projectPaths);
  const { relativePath, absolutePath } = resolveProjectFilePath(selected.rootPath, input.filePath || '');
  const base = {
    projectPath: selected.project.path,
    filePath: relativePath,
    language: languageForPath(relativePath),
    focusLine: Number.isFinite(Number(input.focusLine)) && Number(input.focusLine) > 0 ? Number(input.focusLine) : undefined
  };
  const stat = await fs.stat(absolutePath).catch((error: any) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!stat || !stat.isFile()) {
    return {
      ...base,
      size: 0,
      previewable: false,
      reason: '文件当前不存在或不可预览'
    };
  }
  if (stat.size > maxPreviewFileSize) {
    return {
      ...base,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      previewable: false,
      reason: '文件过大，当前不可预览'
    };
  }
  const content = await fs.readFile(absolutePath);
  if (hasBinaryMarker(content)) {
    return {
      ...base,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      previewable: false,
      reason: '二进制文件当前不可预览'
    };
  }
  return {
    ...base,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    previewable: true,
    content: content.toString('utf8')
  };
}

export async function stageUntrackedFiles(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  expectedBranch: string | undefined,
  input: GitStageUntrackedInput,
  projectPaths: string[] = []
): Promise<GitChangeSummary> {
  if (!projects.length) {
    throw new Error('请先维护涉及工程，再确认待确认新文件');
  }
  const projectPath = String(input.projectPath || '').trim();
  if (!projectPath) {
    throw new Error('缺少待确认新文件所属工程');
  }
  const files = [...new Set((Array.isArray(input.files) ? input.files : []).map(normalizeStageFilePath))];
  if (!files.length) {
    throw new Error('请至少选择一个待确认新文件');
  }

  const selected = await resolveSelectedProject(workspaceRoot, projects, projectPath, projectPaths);

  const status = await runGit(selected.rootPath, ['status', '--short', '--untracked-files=all']);
  const untrackedPaths = new Set(parseGitStatusShort(status).filter((file) => file.status === '??').map((file) => file.path.replace(/\\/g, '/')));
  const invalidFiles = files.filter((file) => !untrackedPaths.has(file));
  if (invalidFiles.length) {
    throw new Error(`只能确认当前仍为待确认状态的新文件: ${invalidFiles.join(', ')}`);
  }

  await runGit(selected.rootPath, ['add', '--', ...files]);
  return readGitChanges(workspaceRoot, projects, expectedBranch, projectPaths);
}

export function hasStagedTrackedChanges(summary: GitChangeSummary): boolean {
  return summary.projects.some((project) => project.files.some((file) => file.staged));
}
