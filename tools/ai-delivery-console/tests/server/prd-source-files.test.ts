import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deletePrdSourceFileSnapshot, savePrdSourceFileSnapshot } from '../../server/services/prd-source-files';
import { WorkflowRepository } from '../../server/services/workflow-repository';

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-prd-files-'));
}

describe('prd-source-files', () => {
  it('将 PRD 来源文件快照到 workflow/file 目录', async () => {
    const workspace = await tmpWorkspace();
    const snapshot = await savePrdSourceFileSnapshot(workspace, '172014', {
      filename: '低保真.md',
      mimeType: 'text/markdown',
      content: Buffer.from('# low-fi')
    });

    expect(snapshot.name).toBe('低保真.md');
    expect(snapshot.path).toContain('docs/172014/workflow/file/');
    expect(snapshot.path.endsWith('.md')).toBe(true);
    await expect(fs.stat(path.join(workspace, snapshot.path))).resolves.toBeTruthy();
  });

  it('拒绝不支持的 PRD 来源文件类型', async () => {
    const workspace = await tmpWorkspace();
    await expect(
      savePrdSourceFileSnapshot(workspace, '172014', {
        filename: 'script.js',
        content: Buffer.from('alert(1)')
      })
    ).rejects.toThrow('仅支持上传 PDF、图片或 Markdown 文件');
  });

  it('删除 PRD 来源文件时同步移除来源路径', async () => {
    const workspace = await tmpWorkspace();
    const repository = new WorkflowRepository(workspace);
    const workflow = await repository.upsert({ requirementId: '172014', title: '定位菜单' });
    const snapshot = await savePrdSourceFileSnapshot(workspace, '172014', {
      filename: 'prd.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-1.4')
    });
    const withFile = await repository.save({
      ...workflow,
      prdSourceFiles: [snapshot],
      sources: ['https://example.feishu.cn/docx/xxx', snapshot.path]
    });

    const updated = await deletePrdSourceFileSnapshot(workspace, withFile, snapshot.id);

    expect(updated.prdSourceFiles).toHaveLength(0);
    expect(updated.sources).toEqual(['https://example.feishu.cn/docx/xxx']);
    await expect(fs.stat(path.join(workspace, snapshot.path))).rejects.toThrow();
  });
});
