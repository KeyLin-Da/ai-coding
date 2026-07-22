import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  listOpenSpecVisualContextCandidates,
  normalizeVisualContextFiles,
  prepareOpenSpecVisualContextAction
} from '../../server/services/open-spec-visual-context';

function workflow(overrides: Partial<RequirementWorkflow> = {}): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    sources: [],
    currentStage: 'IMPLEMENTATION',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: [],
    ...overrides
  };
}

async function writeFile(root: string, relativePath: string, content = 'image') {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
}

describe('open-spec-visual-context', () => {
  it('扫描图片候选并按路径去重，忽略非图片和不存在目录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-context-'));
    await writeFile(root, 'docs/172014/prd/files/menu.png');
    await writeFile(root, 'docs/172014/prd/files/readme.md', '# doc');
    await writeFile(root, 'docs/172014/prd/files/screenshots/detail.jpg');
    await writeFile(root, 'docs/172014/technical-design/file/dialog.webp');

    const candidates = await listOpenSpecVisualContextCandidates(
      root,
      workflow({
        prdSourceFiles: [
          {
            id: 'prd-1',
            name: '菜单截图.png',
            path: 'docs/172014/prd/files/menu.png',
            size: 5,
            mimeType: 'image/png',
            uploadedAt: '2026-07-17T00:00:00.000Z'
          }
        ],
        techDesignSourceFiles: [
          {
            id: 'tech-1',
            name: '弹窗.webp',
            path: 'docs/172014/technical-design/file/dialog.webp',
            size: 5,
            mimeType: 'image/webp',
            uploadedAt: '2026-07-17T00:00:00.000Z'
          }
        ]
      })
    );

    expect(candidates.map((item) => item.path)).toEqual([
      'docs/172014/prd/files/menu.png',
      'docs/172014/prd/files/screenshots/detail.jpg',
      'docs/172014/technical-design/file/dialog.webp'
    ]);
    expect(candidates.find((item) => item.path.endsWith('menu.png'))?.source).toBe('PRD_SOURCE');
    expect(candidates.some((item) => item.path.endsWith('readme.md'))).toBe(false);
  });

  it('规范化视觉上下文路径并拦截非图片和越界路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-context-normalize-'));
    await writeFile(root, 'docs/172014/prd/files/menu.png');
    await writeFile(root, 'docs/172014/prd/files/readme.md', '# doc');

    await expect(normalizeVisualContextFiles(root, ['docs/172014/prd/files/menu.png', 'docs/172014/prd/files/menu.png'])).resolves.toEqual([
      'docs/172014/prd/files/menu.png'
    ]);
    await expect(normalizeVisualContextFiles(root, ['docs/172014/prd/files/readme.md'])).rejects.toThrow('仅支持图片文件');
    await expect(normalizeVisualContextFiles(root, ['../outside.png'])).rejects.toThrow('路径不在工作区内');
  });

  it('为 OPENSPEC_FF 写入视觉上下文快照并回填动作参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-context-snapshot-'));
    await writeFile(root, 'docs/172014/prd/files/menu.png');

    const result = await prepareOpenSpecVisualContextAction(
      root,
      workflow(),
      {
        actionType: 'OPENSPEC_FF',
        params: {
          changeName: 'req-172014',
          visualContextFiles: ['docs/172014/prd/files/menu.png']
        }
      },
      '2026-07-17T00:00:00.000Z'
    );

    expect(result.snapshot?.selectedPaths).toEqual(['docs/172014/prd/files/menu.png']);
    expect(result.action.params?.openSpecVisualContextPath).toContain('visual-context.md');
    const snapshotPath = path.join(root, String(result.snapshot?.contextPath));
    await expect(fs.readFile(snapshotPath, 'utf8')).resolves.toContain('![menu.png](docs/172014/prd/files/menu.png)');
  });
});
