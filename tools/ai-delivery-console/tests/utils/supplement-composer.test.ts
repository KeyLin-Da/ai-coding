import { describe, expect, it } from 'vitest';
import type { SupplementBlock } from '../../shared/workflow';
import {
  buildSupplementBlocks,
  buildSupplementComposerValue,
  exportSupplementMarkdown,
  extractSupplementSourceFiles,
  isSupplementComposerEmpty,
  textToSupplementBlocks
} from '../../src/utils/supplement-composer';

describe('supplement-composer', () => {
  it('将旧版纯文本拆成段落块', () => {
    const blocks = textToSupplementBlocks('第一段说明\n\n第二段说明');

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'PARAGRAPH', text: '第一段说明' });
    expect(blocks[1]).toMatchObject({ type: 'PARAGRAPH', text: '第二段说明' });
  });

  it('将图片和文件块按顺序导出为 Markdown', () => {
    const blocks: SupplementBlock[] = [
      { id: 'p1', type: 'PARAGRAPH', text: '先说明现象' },
      {
        id: 'img1',
        type: 'IMAGE',
        fileId: 'f1',
        name: '菜单截图.png',
        path: 'docs/100/prd/files/menu.png',
        size: 1200,
        mimeType: 'image/png',
        contextRole: 'INLINE'
      },
      { id: 'p2', type: 'PARAGRAPH', text: '再补充错误日志' },
      {
        id: 'file1',
        type: 'FILE',
        fileId: 'f2',
        name: 'error.md',
        path: 'docs/100/prd/files/error.md',
        size: 300,
        mimeType: 'text/markdown'
      }
    ];

    expect(exportSupplementMarkdown(blocks)).toBe(
      '先说明现象\n\n![菜单截图.png](docs/100/prd/files/menu.png)\n\n再补充错误日志\n\n[补充文件: error.md](docs/100/prd/files/error.md)'
    );
    expect(extractSupplementSourceFiles(blocks)).toEqual(['docs/100/prd/files/error.md']);
  });

  it('兼容旧版文本和附件并自动识别图片/文件', () => {
    const blocks = buildSupplementBlocks({
      text: '旧补充说明',
      files: [
        {
          id: 'img',
          name: 'screen.jpg',
          path: 'docs/100/prd/files/screen.jpg',
          size: 100,
          mimeType: 'image/jpeg',
          uploadedAt: '2026-07-16T10:00:00.000Z'
        },
        {
          id: 'pdf',
          name: 'prd.pdf',
          path: 'docs/100/prd/files/prd.pdf',
          size: 200,
          mimeType: 'application/pdf',
          uploadedAt: '2026-07-16T10:00:00.000Z'
        }
      ]
    });

    expect(blocks.map((block) => block.type)).toEqual(['PARAGRAPH', 'IMAGE', 'FILE']);
    expect(buildSupplementComposerValue(blocks)).toMatchObject({
      markdown: expect.stringContaining('旧补充说明'),
      sourceFiles: ['docs/100/prd/files/screen.jpg', 'docs/100/prd/files/prd.pdf']
    });
  });

  it('明确保存为空 blocks 时不从旧附件列表自动补回文件', () => {
    const blocks = buildSupplementBlocks({
      blocks: [],
      text: '',
      files: [
        {
          id: 'img',
          name: 'screen.jpg',
          path: 'docs/100/prd/files/screen.jpg',
          size: 100,
          mimeType: 'image/jpeg'
        }
      ]
    });

    expect(blocks).toEqual([]);
  });

  it('旧 pasted 图片按内联处理，不进入 sourceFiles', () => {
    const blocks: SupplementBlock[] = [
      {
        id: 'img',
        type: 'IMAGE',
        fileId: 'img',
        name: 'pasted-20260717090000-1.png',
        path: 'docs/100/prd/files/pasted-20260717090000-1.png',
        size: 100,
        mimeType: 'image/png'
      }
    ];

    expect(buildSupplementComposerValue(blocks)).toMatchObject({
      sourceFiles: []
    });
  });

  it('空内容导出为空值', () => {
    expect(isSupplementComposerEmpty([])).toBe(true);
    expect(buildSupplementComposerValue([{ id: 'p', type: 'PARAGRAPH', text: '   ' }])).toEqual({
      blocks: [],
      markdown: '',
      sourceFiles: []
    });
  });

  it('上传失败块保留在 Markdown 中但不进入 sourceFiles', () => {
    const blocks: SupplementBlock[] = [
      { id: 'p', type: 'PARAGRAPH', text: '失败前说明' },
      {
        id: 'failed',
        type: 'IMAGE',
        fileId: 'pending-1',
        name: 'paste.png',
        path: '',
        size: 0,
        status: 'FAILED',
        error: '网络异常'
      }
    ];

    expect(exportSupplementMarkdown(blocks)).toContain('[图片上传失败: paste.png，网络异常]');
    expect(extractSupplementSourceFiles(blocks)).toEqual([]);
  });
});
