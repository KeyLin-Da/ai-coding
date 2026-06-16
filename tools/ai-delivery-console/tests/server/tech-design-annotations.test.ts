import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  consumeTechDesignAnnotations,
  createTechDesignAnnotation,
  deleteTechDesignAnnotation,
  listTechDesignAnnotations,
  techDesignAnnotationSummaryPath,
  updateTechDesignAnnotationStatus
} from '../../server/services/tech-design-annotations';

async function prepareDesign(root: string) {
  const filePath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '# 技术方案\n\n需要补充缓存策略。', 'utf8');
}

function annotationInput() {
  return {
    versionId: 'current',
    selectedText: '需要补充缓存策略',
    comment: '这里要说明 Redis key 和过期时间。',
    includeInNextGeneration: true,
    anchor: {
      plainStart: 7,
      plainEnd: 15,
      prefixText: '技术方案',
      suffixText: '。',
      headingPath: ['技术方案'],
      occurrence: 1
    }
  };
}

describe('tech-design-annotations service', () => {
  it('新增批注并重建可纳入生成的 Markdown 摘要', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-annotation-'));
    await prepareDesign(root);

    const result = await createTechDesignAnnotation(root, '172014', annotationInput());
    const summary = await fs.readFile(path.join(root, techDesignAnnotationSummaryPath('172014')), 'utf8');

    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]).toMatchObject({ status: 'OPEN', includeInNextGeneration: true });
    expect(summary).toContain('Redis key');
    expect(summary).toContain('需要补充缓存策略');
  });

  it('expectedHash 不一致时阻止覆盖批注索引', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-annotation-conflict-'));
    await prepareDesign(root);
    await createTechDesignAnnotation(root, '172014', annotationInput());

    await expect(createTechDesignAnnotation(root, '172014', { ...annotationInput(), expectedHash: 'stale' })).rejects.toThrow('批注已被外部修改');
  });

  it('已解决批注会从摘要中排除', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-annotation-resolved-'));
    await prepareDesign(root);
    const created = await createTechDesignAnnotation(root, '172014', annotationInput());

    await updateTechDesignAnnotationStatus(root, '172014', created.annotations[0].id, {
      status: 'RESOLVED',
      includeInNextGeneration: false,
      expectedHash: created.hash
    });
    const summaryPath = path.join(root, techDesignAnnotationSummaryPath('172014'));
    const list = await listTechDesignAnnotations(root, '172014');

    expect(list.annotations[0].status).toBe('RESOLVED');
    await expect(fs.readFile(summaryPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('删除批注后同步移除索引和摘要内容', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-annotation-delete-'));
    await prepareDesign(root);
    const created = await createTechDesignAnnotation(root, '172014', annotationInput());

    const deleted = await deleteTechDesignAnnotation(root, '172014', created.annotations[0].id, {
      expectedHash: created.hash
    });
    const summaryPath = path.join(root, techDesignAnnotationSummaryPath('172014'));

    expect(deleted.annotations).toHaveLength(0);
    await expect(fs.readFile(summaryPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('消费批注后记录运行信息并移除下一次生成摘要', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-annotation-consume-'));
    await prepareDesign(root);
    const created = await createTechDesignAnnotation(root, '172014', annotationInput());

    const consumed = await consumeTechDesignAnnotations(root, '172014', 'run-design-1');
    const summaryPath = path.join(root, techDesignAnnotationSummaryPath('172014'));

    expect(consumed.annotations).toHaveLength(1);
    expect(consumed.annotations[0]).toMatchObject({
      id: created.annotations[0].id,
      consumedRunId: 'run-design-1'
    });
    expect(consumed.annotations[0].consumedAt).toBeTruthy();
    await expect(fs.readFile(summaryPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
