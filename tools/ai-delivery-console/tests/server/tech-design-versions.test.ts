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
    await writeDesign(root, '# 技术方案\n\n评审版本: v1.9\n\n旧方案');

    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    await writeDesign(root, '# 技术方案\n\n评审版本: v2.0\n\n新方案');
    const versions = await listTechDesignVersions(root, '172014');
    const draftSnapshot = versions.find((version) => version.source === 'DRAFT_SNAPSHOT');

    expect(snapshot?.source).toBe('DRAFT_SNAPSHOT');
    expect(snapshot?.label).toBe('v1.9');
    expect(versions[0]).toMatchObject({ id: 'current', source: 'CURRENT_DRAFT', label: 'v2.0 当前草稿', readable: true });
    expect(draftSnapshot?.label).toBe('v1.9');
  });

  it('未解析到评审版本时不合成 vX.Y 展示', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-version-fallback-'));
    await writeDesign(root, '# 技术方案\n\n旧方案');

    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    await writeDesign(root, '# 技术方案\n\n新方案');
    const versions = await listTechDesignVersions(root, '172014');
    const draftSnapshot = versions.find((version) => version.source === 'DRAFT_SNAPSHOT');

    expect(snapshot?.label).not.toMatch(/^v\d/i);
    expect(versions[0]).toMatchObject({ id: 'current', source: 'CURRENT_DRAFT', label: '当前草稿', readable: true });
    expect(draftSnapshot?.label).not.toMatch(/^v\d/i);
  });

  it('缺少评审版本字段时从修订记录第一条解析版本号', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-version-revision-'));
    await writeDesign(root, '# 技术方案\n\n## 修订记录\n\n| 版本 | 日期 |\n| --- | --- |\n| v2.0 | 2026-06-24 |\n| v1.9 | 2026-06-23 |\n');

    const versions = await listTechDesignVersions(root, '172014');

    expect(versions[0]).toMatchObject({ id: 'current', source: 'CURRENT_DRAFT', label: 'v2.0 当前草稿', readable: true });
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
    await writeDesign(root, '# 方案\n\n评审版本: v1.9\n\n旧内容');
    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    await writeDesign(root, '# 方案\n\n评审版本: v2.0\n\n新内容');

    const diff = await diffTechDesignVersions(root, '172014', {
      leftVersionId: snapshot?.id || '',
      rightVersionId: 'current'
    });

    expect(diff.diff).toContain('-旧内容');
    expect(diff.diff).toContain('+新内容');
    expect(diff.diff).toContain('a/v1.9');
    expect(diff.diff).toContain('b/v2.0 当前草稿');
    expect(diff.truncated).toBe(false);
  });
});
