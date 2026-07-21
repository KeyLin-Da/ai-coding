import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  hasStagedTrackedChanges,
  parseGitStatusShort,
  readGitChangedFilePreview,
  readGitChanges,
  readGitDiffPreview,
  stageUntrackedFiles
} from '../../server/services/git-changes';

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
    await fs.writeFile(path.join(projectRoot, 'src', 'generated.txt'), 'generated\n', 'utf8');

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
    expect(summary.projects[0].files.map((file) => file.path)).not.toContain('src/generated.txt');
    expect(summary.projects[0].untrackedFiles[0].path).toBe('src/generated.txt');
    expect(summary.projects[0].additions).toBeGreaterThan(0);
    expect(summary.projects[0].diff).toContain('diff --git');
    expect(summary.files[0].path).toBe('opp-gateway/src/a.txt');
    expect(summary.untrackedFiles[0].path).toBe('opp-gateway/src/generated.txt');
    expect(hasStagedTrackedChanges(summary)).toBe(false);
  });

  it('识别指定工程中已暂存的 tracked 变更', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\nnew\n', 'utf8');
    await git(projectRoot, ['add', 'src/a.txt']);

    const summary = await readGitChanges(workspace, [{ name: 'opp-gateway', path: 'opp-gateway' }]);

    expect(summary.files[0].staged).toBe(true);
    expect(hasStagedTrackedChanges(summary)).toBe(true);
  });

  it('支持读取配置工程父目录下的外部工程变更', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    await git(projectRoot, ['checkout', '-b', 'feature/opp#172014']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\nnew\n', 'utf8');

    const summary = await readGitChanges(workspace, [{ name: 'opp-api', path: 'opp-api' }], 'feature/opp#172014', [projectParent]);

    expect(summary.projects[0].project.path).toBe(projectRoot);
    expect(summary.projects[0].files[0].path).toBe('src/a.txt');
    expect(summary.files[0].path).toBe(`${projectRoot}/src/a.txt`);
  });

  it('支持按上下文范围和单文件读取 diff 预览', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), Array.from({ length: 80 }, (_, index) => `a-${index + 1}`).join('\n'), 'utf8');
    await fs.writeFile(path.join(projectRoot, 'src', 'b.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), Array.from({ length: 80 }, (_, index) => (index === 39 ? 'a-changed' : `a-${index + 1}`)).join('\n'), 'utf8');
    await fs.writeFile(path.join(projectRoot, 'src', 'b.txt'), 'old\nnew\n', 'utf8');

    // 扩展上下文用于覆盖代码审核中行号跳跃场景，单文件参数应只返回目标文件 diff。
    const preview = await readGitDiffPreview(
      workspace,
      [{ name: 'opp-gateway', path: 'opp-gateway' }],
      {
        projectPath: 'opp-gateway',
        filePath: 'src/a.txt',
        contextLines: 30
      }
    );

    expect(preview.contextLines).toBe(30);
    expect(preview.filePath).toBe('src/a.txt');
    expect(preview.diff).toContain('a-changed');
    expect(preview.diff).not.toContain('src/b.txt');
    expect(preview.files.map((file) => file.path)).toEqual(['src/a.txt']);
  });

  it('安全读取完整文件预览并处理不可预览文件', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.java'), 'class Demo {}\n', 'utf8');
    await fs.writeFile(path.join(projectRoot, 'src', 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    await fs.writeFile(path.join(projectRoot, 'src', 'large.txt'), 'x'.repeat(1024 * 1024 + 1), 'utf8');

    const projects = [{ name: 'opp-gateway', path: 'opp-gateway' }];
    const preview = await readGitChangedFilePreview(workspace, projects, {
      projectPath: 'opp-gateway',
      filePath: 'src/a.java',
      focusLine: 1
    });
    const binary = await readGitChangedFilePreview(workspace, projects, { projectPath: 'opp-gateway', filePath: 'src/binary.bin' });
    const large = await readGitChangedFilePreview(workspace, projects, { projectPath: 'opp-gateway', filePath: 'src/large.txt' });
    const missing = await readGitChangedFilePreview(workspace, projects, { projectPath: 'opp-gateway', filePath: 'src/missing.txt' });

    expect(preview.previewable).toBe(true);
    expect(preview.language).toBe('java');
    expect(preview.focusLine).toBe(1);
    expect(preview.content).toContain('class Demo');
    expect(binary.previewable).toBe(false);
    expect(binary.reason).toContain('二进制');
    expect(large.previewable).toBe(false);
    expect(large.reason).toContain('过大');
    expect(missing.previewable).toBe(false);
    expect(missing.reason).toContain('不存在');
  });

  it('拒绝 diff 和完整文件预览的不安全路径与非当前工程', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');

    const projects = [{ name: 'opp-gateway', path: 'opp-gateway' }];
    await expect(readGitDiffPreview(workspace, projects, { projectPath: 'opp-other', filePath: 'src/a.txt' })).rejects.toThrow('不在当前需求范围');
    await expect(readGitDiffPreview(workspace, projects, { projectPath: 'opp-gateway', filePath: '../secret.txt' })).rejects.toThrow('不合法');
    await expect(readGitChangedFilePreview(workspace, projects, { projectPath: 'opp-gateway', filePath: '/tmp/secret.txt' })).rejects.toThrow('相对路径');
  });

  it('支持受控暂存当前工程的待确认新文件', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'generated.txt'), 'generated\n', 'utf8');

    const summary = await stageUntrackedFiles(
      workspace,
      [{ name: 'opp-gateway', path: 'opp-gateway' }],
      undefined,
      {
        projectPath: 'opp-gateway',
        files: ['src/generated.txt']
      }
    );

    expect(summary.projects[0].untrackedFiles).toHaveLength(0);
    expect(summary.projects[0].files.find((file) => file.path === 'src/generated.txt')?.staged).toBe(true);
    expect(hasStagedTrackedChanges(summary)).toBe(true);
  });

  it('拒绝不安全路径、非当前工程和非待确认状态文件', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-git-'));
    const projectRoot = path.join(workspace, 'opp-gateway');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await fs.writeFile(path.join(projectRoot, 'src', 'generated.txt'), 'generated\n', 'utf8');
    await git(projectRoot, ['add', 'src/a.txt']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);

    const projects = [{ name: 'opp-gateway', path: 'opp-gateway' }];
    await expect(stageUntrackedFiles(workspace, projects, undefined, { projectPath: 'opp-gateway', files: ['/tmp/evil.txt'] })).rejects.toThrow('相对路径');
    await expect(stageUntrackedFiles(workspace, projects, undefined, { projectPath: 'opp-gateway', files: ['../evil.txt'] })).rejects.toThrow('不合法');
    await expect(stageUntrackedFiles(workspace, projects, undefined, { projectPath: 'opp-other', files: ['src/generated.txt'] })).rejects.toThrow('不在当前需求范围');
    await expect(stageUntrackedFiles(workspace, projects, undefined, { projectPath: 'opp-gateway', files: ['src/a.txt'] })).rejects.toThrow('仍为待确认状态');

    const summary = await readGitChanges(workspace, projects);
    expect(summary.projects[0].untrackedFiles.map((file) => file.path)).toContain('src/generated.txt');
  });
});
