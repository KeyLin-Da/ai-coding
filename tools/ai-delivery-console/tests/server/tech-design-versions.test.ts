import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  createTechDesignDraftSnapshot,
  diffTechDesignVersions,
  listTechDesignVersions,
  readTechDesignVersionContent
} from '../../server/services/tech-design-versions';

const exec = promisify(execFile);

async function writeDesign(root: string, content: string) {
  const filePath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function git(cwd: string, args: string[]) {
  await exec('git', args, { cwd });
}

describe('tech-design-versions service', () => {
  it('列出当前草稿和本机草稿快照', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-version-'));
    await writeDesign(root, '# v1\n\n旧方案');

    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    await writeDesign(root, '# v2\n\n新方案');
    const versions = await listTechDesignVersions(root, '172014');

    expect(snapshot?.source).toBe('DRAFT_SNAPSHOT');
    expect(versions[0]).toMatchObject({ id: 'current', source: 'CURRENT_DRAFT', readable: true });
    expect(versions.some((version) => version.source === 'DRAFT_SNAPSHOT')).toBe(true);
  });

  it('从 Git 历史读取已发布版本正文', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-git-version-'));
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'test@example.com']);
    await git(root, ['config', 'user.name', 'Test User']);
    await writeDesign(root, '# v1\n\n旧方案');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', 'v1']);
    await writeDesign(root, '# v2\n\n新方案');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', 'v2']);

    const versions = await listTechDesignVersions(root, '172014');
    const gitVersion = versions.find((version) => version.source === 'PUBLISHED');
    expect(gitVersion).toBeTruthy();
    const content = await readTechDesignVersionContent(root, '172014', gitVersion?.id || '');
    expect(content.content).toContain('# v2');
  });

  it('生成草稿快照和当前草稿之间的 unified diff', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-diff-'));
    await writeDesign(root, '# 方案\n\n旧内容');
    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    await writeDesign(root, '# 方案\n\n新内容');

    const diff = await diffTechDesignVersions(root, '172014', {
      leftVersionId: snapshot?.id || '',
      rightVersionId: 'current'
    });

    expect(diff.diff).toContain('-旧内容');
    expect(diff.diff).toContain('+新内容');
    expect(diff.truncated).toBe(false);
  });
});
