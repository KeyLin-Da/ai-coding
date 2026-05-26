import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGitStatusShort, readGitChanges } from '../../server/services/git-changes';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await exec('git', args, { cwd });
}

describe('git-changes', () => {
  it('解析 git status --short 输出', () => {
    const files = parseGitStatusShort([' M src/a.ts', 'A  src/b.ts', '?? docs/new.md', 'R  old.ts -> src/new.ts'].join('\n'));

    expect(files).toEqual([
      { path: 'src/a.ts', status: 'M', staged: false, unstaged: true },
      { path: 'src/b.ts', status: 'A', staged: true, unstaged: false },
      { path: 'docs/new.md', status: '??', staged: false, unstaged: true },
      { path: 'src/new.ts', status: 'R', staged: true, unstaged: false }
    ]);
  });

  it('未配置涉及工程时阻止读取整个工作区变更', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));

    await expect(readGitChanges(workspace, [], 'feature/opp#172014')).rejects.toThrow('请先维护涉及工程');
  });

  it('按涉及工程读取当前分支、文件变更和 diff 统计', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    await git(projectRoot, ['checkout', '-b', 'feature/opp#172014']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\nnew\n', 'utf8');

    const summary = await readGitChanges(
      workspace,
      [
        {
          name: 'opp-gateway',
          path: 'opp-gateway'
        }
      ],
      'feature/opp#172014'
    );

    expect(summary.projects).toHaveLength(1);
    expect(summary.projects[0].currentBranch).toBe('feature/opp#172014');
    expect(summary.projects[0].branchMatches).toBe(true);
    expect(summary.projects[0].files[0].path).toBe('src/a.txt');
    expect(summary.projects[0].additions).toBeGreaterThan(0);
    expect(summary.projects[0].diff).toContain('diff --git');
    expect(summary.files[0].path).toBe('opp-gateway/src/a.txt');
  });
});
