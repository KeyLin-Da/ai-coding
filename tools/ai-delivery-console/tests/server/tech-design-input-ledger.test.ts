import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyStages } from '../../shared/workflow';
import {
  consumeTechDesignInputLedger,
  consumedQuestionPathsFromLedger,
  mergeTechDesignInputLedgerIntoWorkflow,
  readTechDesignInputLedger,
  techDesignInputLedgerPath
} from '../../server/services/tech-design-input-ledger';

describe('tech-design-input-ledger service', () => {
  it('将技术方案增量输入消费状态写入可同步台账', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-ledger-'));

    const ledger = await consumeTechDesignInputLedger(root, '172014', {
      questionPaths: ['docs/172014/technical-design/questions/20260605-101500-question.md'],
      sourceFilePaths: ['docs/172014/technical-design/file/file-1.md'],
      clarification: '补充异常场景',
      runId: 'run-design-1'
    });
    const saved = await readTechDesignInputLedger(root, '172014');
    const raw = await fs.readFile(path.join(root, techDesignInputLedgerPath('172014')), 'utf8');

    expect(saved).toEqual(ledger);
    expect(raw).toContain('20260605-101500-question.md');
    expect(raw).toContain('SOURCE_FILE');
    expect(raw).toContain('CLARIFICATION');
    expect(consumedQuestionPathsFromLedger(saved)).toEqual(['docs/172014/technical-design/questions/20260605-101500-question.md']);
  });

  it('加载需求时合并台账和旧 workflow 消费字段', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-ledger-merge-'));
    await consumeTechDesignInputLedger(root, '172014', {
      questionPaths: ['docs/172014/technical-design/questions/new.md'],
      runId: 'run-design-1'
    });

    const now = new Date().toISOString();
    const merged = await mergeTechDesignInputLedgerIntoWorkflow(root, {
      requirementId: '172014',
      title: '定位菜单',
      sources: [],
      currentStage: 'TECH_DESIGN',
      status: 'IN_PROGRESS',
      createdAt: now,
      updatedAt: now,
      stages: createEmptyStages(),
      artifacts: [],
      techDesignConsumedQuestionPaths: ['docs/172014/technical-design/questions/old.md'],
      runs: [],
      reviews: [],
      issues: []
    });

    expect(merged.techDesignConsumedQuestionPaths).toEqual([
      'docs/172014/technical-design/questions/old.md',
      'docs/172014/technical-design/questions/new.md'
    ]);
  });
});
