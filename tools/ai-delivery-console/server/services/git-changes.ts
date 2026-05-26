import { spawn } from 'node:child_process';
import type { GitChangeSummary, GitChangedFile } from '../../shared/workflow';

const maxDiffLength = 120_000;

function runGit(workspaceRoot: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
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

export async function readGitChanges(workspaceRoot: string): Promise<GitChangeSummary> {
  const [status, unstagedDiff, stagedDiff] = await Promise.all([
    runGit(workspaceRoot, ['status', '--short']),
    runGit(workspaceRoot, ['diff', '--no-ext-diff']),
    runGit(workspaceRoot, ['diff', '--cached', '--no-ext-diff'])
  ]);
  const diff = [stagedDiff && '# Staged changes\n\n', stagedDiff, unstagedDiff && '# Unstaged changes\n\n', unstagedDiff].filter(Boolean).join('');
  return {
    updatedAt: new Date().toISOString(),
    files: parseGitStatusShort(status),
    diff: diff.length > maxDiffLength ? `${diff.slice(0, maxDiffLength)}\n\n... diff 内容过长，已截断 ...\n` : diff
  };
}
