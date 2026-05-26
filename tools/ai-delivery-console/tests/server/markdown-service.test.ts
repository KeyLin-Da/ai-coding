import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readArtifact, saveArtifact } from '../../server/services/markdown-service';
import { hashContent } from '../../server/services/workspace';

async function makeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-markdown-'));
}

describe('markdown-service', () => {
  it('读取缺失 Markdown 时返回空内容和默认 hash', async () => {
    const root = await makeRoot();
    const result = await readArtifact(root, 'docs/172014/prd/analysis.md');

    expect(result.content).toBe('');
    expect(result.artifact.exists).toBe(false);
    expect(result.artifact.path).toBe('docs/172014/prd/analysis.md');
    expect(result.artifact.hash).toBe(hashContent(''));
  });

  it('保存新 Markdown 时自动创建父目录', async () => {
    const root = await makeRoot();
    const result = await saveArtifact(root, 'docs/172014/prd/analysis.md', '# PRD', hashContent(''));

    expect(result.artifact.exists).toBe(true);
    expect(result.content).toBe('# PRD');
    await expect(fs.readFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), 'utf8')).resolves.toBe('# PRD');
  });

  it('缺失文件被外部创建后使用旧 hash 保存会触发冲突', async () => {
    const root = await makeRoot();
    const missing = await readArtifact(root, 'docs/172014/prd/analysis.md');
    await fs.mkdir(path.join(root, 'docs', '172014', 'prd'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), '# External');

    await expect(saveArtifact(root, 'docs/172014/prd/analysis.md', '# Local', missing.artifact.hash)).rejects.toThrow(
      '文件已被外部修改，请刷新后合并差异'
    );
  });
});
