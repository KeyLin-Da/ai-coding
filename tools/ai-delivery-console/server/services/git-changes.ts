import { spawn } from 'node:child_process';
import path from 'node:path';
import type { GitChangeSummary, GitChangedFile, GitProjectChangeSummary, WorkflowProject } from '../../shared/workflow';
import { assertInsideWorkspace } from './workspace';

const maxDiffLength = 120_000;

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

function truncateDiff(diff: string): string {
  return diff.length > maxDiffLength ? `${diff.slice(0, maxDiffLength)}\n\n... diff 内容过长，已截断 ...\n` : diff;
}

async function readProjectGitChanges(workspaceRoot: string, project: WorkflowProject, expectedBranch?: string): Promise<GitProjectChangeSummary> {
  const projectRoot = assertInsideWorkspace(workspaceRoot, project.path);
  const projectRef = {
    name: project.name || path.basename(project.path),
    path: project.path
  };
  try {
    const [currentBranch, status, unstagedDiff, stagedDiff, unstagedNumstat, stagedNumstat] = await Promise.all([
      runGit(projectRoot, ['branch', '--show-current']),
      runGit(projectRoot, ['status', '--short']),
      runGit(projectRoot, ['diff', '--no-ext-diff']),
      runGit(projectRoot, ['diff', '--cached', '--no-ext-diff']),
      runGit(projectRoot, ['diff', '--numstat']),
      runGit(projectRoot, ['diff', '--cached', '--numstat'])
    ]);
    const files = mergeStats(parseGitStatusShort(status), parseNumstat(unstagedNumstat), parseNumstat(stagedNumstat));
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
      stagedDiff: '',
      unstagedDiff: '',
      diff: '',
      additions: 0,
      deletions: 0,
      error: error.message || '读取 Git 变更失败'
    };
  }
}

export async function readGitChanges(workspaceRoot: string, projects: WorkflowProject[] = [], expectedBranch?: string): Promise<GitChangeSummary> {
  if (!projects.length) {
    throw new Error('请先维护涉及工程，再查看变更文件及代码');
  }
  const projectSummaries = await Promise.all(projects.map((project) => readProjectGitChanges(workspaceRoot, project, expectedBranch)));
  const files = projectSummaries.flatMap((summary) =>
    summary.files.map((file) => ({
      ...file,
      path: summary.project.path === '.' ? file.path : `${summary.project.path}/${file.path}`
    }))
  );
  const diff = projectSummaries.map((summary) => summary.diff).filter(Boolean).join('\n');
  return {
    updatedAt: new Date().toISOString(),
    files,
    diff: truncateDiff(diff),
    projects: projectSummaries,
    additions: projectSummaries.reduce((sum, summary) => sum + summary.additions, 0),
    deletions: projectSummaries.reduce((sum, summary) => sum + summary.deletions, 0)
  };
}
