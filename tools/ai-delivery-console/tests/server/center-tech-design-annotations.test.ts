import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  consumeCenterTechDesignAnnotationsAndSnapshot,
  createCenterTechDesignAnnotation,
  prepareCenterTechDesignAnnotationInput,
  techDesignAnnotationSnapshotPath
} from '../../server/services/center-tech-design-annotations';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';

async function tmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function prepareDesign(root: string) {
  const filePath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '# 技术方案\n\n需要补充缓存策略。', 'utf8');
}

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    id: 100,
    requirementId: '172014',
    title: '定位菜单',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

function centerAnnotation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'annotation-center-1',
    artifactPath: 'docs/172014/technical-design/design_review.md',
    versionId: 'current',
    versionSource: 'CURRENT_DRAFT',
    contentHash: 'tech-hash',
    selectedText: '需要补充缓存策略',
    anchor: {
      plainStart: 7,
      plainEnd: 15,
      prefixText: '技术方案',
      suffixText: '。',
      headingPath: ['技术方案'],
      occurrence: 1
    },
    comment: '补充 Redis key 和过期时间',
    status: 'OPEN',
    includeInNextGeneration: true,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    ...overrides
  };
}

function centerResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data })
  } as Response;
}

describe('center-tech-design-annotations service', () => {
  it('新增中心批注时携带技术方案版本信息', async () => {
    const root = await tmpDir('ai-delivery-center-annotation-create-');
    await prepareDesign(root);
    const requests: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return centerResponse([centerAnnotation()]);
    });

    const result = await createCenterTechDesignAnnotation(root, { userId: 1, fetchImpl }, workflow(), {
      versionId: 'current',
      selectedText: '需要补充缓存策略',
      comment: '补充 Redis key 和过期时间',
      includeInNextGeneration: true,
      anchor: {
        plainStart: 7,
        plainEnd: 15,
        prefixText: '技术方案',
        suffixText: '。',
        headingPath: ['技术方案'],
        occurrence: 1
      }
    });

    expect(requests[0].url).toContain('/api/ai-delivery/requirements/100/tech-design-annotations');
    expect(requests[0].body).toMatchObject({
      artifactPath: 'docs/172014/technical-design/design_review.md',
      versionId: 'current',
      versionSource: 'CURRENT_DRAFT',
      selectedText: '需要补充缓存策略',
      comment: '补充 Redis key 和过期时间'
    });
    expect(result.annotations[0]).toMatchObject({
      id: 'annotation-center-1',
      requirementId: '172014',
      status: 'OPEN'
    });
  });

  it('生成前将中心待消费批注写入运行时 Markdown 输入', async () => {
    const root = await tmpDir('ai-delivery-center-annotation-input-');
    const fetchImpl = vi.fn(async () => centerResponse([centerAnnotation()]));

    const prepared = await prepareCenterTechDesignAnnotationInput(root, { userId: 1, fetchImpl }, workflow());
    expect(prepared?.annotations).toHaveLength(1);
    expect(prepared?.sourceFilePath).toContain('.ai-delivery');
    if (!prepared) {
      throw new Error('expected annotation input to be prepared');
    }

    const content = await fs.readFile(prepared.sourceFilePath, 'utf8');
    expect(content).toContain('# 技术方案批注摘要');
    expect(content).toContain('补充 Redis key 和过期时间');
  });

  it('中心待消费批注接口不存在时不阻断生成', async () => {
    const root = await tmpDir('ai-delivery-center-annotation-missing-pending-');
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'not found' })
    } as Response));

    await expect(prepareCenterTechDesignAnnotationInput(root, { userId: 1, fetchImpl }, workflow())).resolves.toBeUndefined();
  });

  it('生成成功后消费中心批注并写入 Markdown 快照', async () => {
    const root = await tmpDir('ai-delivery-center-annotation-consume-');
    const fetchImpl = vi.fn(async () => centerResponse([centerAnnotation({ consumedRunId: 'run-design-1' })]));

    const consumed = await consumeCenterTechDesignAnnotationsAndSnapshot(root, { userId: 1, fetchImpl }, workflow(), 'run-design-1');
    const snapshot = await fs.readFile(path.join(root, techDesignAnnotationSnapshotPath('172014', 'run-design-1')), 'utf8');

    expect(consumed).toHaveLength(1);
    expect(snapshot).toContain('# 技术方案批注消费快照');
    expect(snapshot).toContain('run-design-1');
    expect(snapshot).toContain('annotation-center-1');
  });

  it('中心批注消费接口不存在时不阻断生成后处理', async () => {
    const root = await tmpDir('ai-delivery-center-annotation-missing-consume-');
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'not found' })
    } as Response));

    await expect(
      consumeCenterTechDesignAnnotationsAndSnapshot(root, { userId: 1, fetchImpl }, workflow(), 'run-design-1')
    ).resolves.toEqual([]);
  });
});
