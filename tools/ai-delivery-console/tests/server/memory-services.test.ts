import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyStages, type RequirementWorkflow, type RunRecord } from '../../shared/workflow';
import { MemoryRepository } from '../../server/services/memory-repository';
import { extractMemoryCandidatesForDesignRun } from '../../server/services/memory-candidate-service';
import { searchProjectMemory } from '../../server/services/memory-search-service';
import { confirmMemoryRecallForRun, markMemoryRecallApplied, prepareMemoryRecallForRun, previewMemoryRecallForRun } from '../../server/services/memory-recall-service';
import { assertMemoryPath } from '../../server/services/memory-paths';
import { buildMemoryQueryProfile } from '../../server/services/memory-query-profile-service';
import {
  getRetrospectiveSummary,
  importRetrospectiveRunOutputs,
  retrospectiveCandidatesPath,
  retrospectiveDir,
  retrospectiveEvidencePath,
  retrospectiveRecallFeedbackPath,
  retrospectiveSummaryPath
} from '../../server/services/retrospective-service';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '174705',
    title: '课程积分成长值配置',
    requirementType: 'REQUIREMENT',
    branchName: 'feature/opp#174705',
    projects: [{ name: 'opp-learn', path: 'opp-learn' }],
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: [],
    techDesignDocument: 'docs/174705/technical-design/design_review.md'
  };
}

function designRun(): RunRecord {
  const now = new Date().toISOString();
  return {
    id: 'run-design-1',
    requirementId: '174705',
    actionType: 'DESIGN_GENERATE',
    stage: 'TECH_DESIGN',
    status: 'SUCCEEDED',
    startedAt: now,
    finishedAt: now,
    params: {},
    techDesignInputSnapshot: {
      questionPaths: [],
      sourceFilePaths: [],
      clarification: 'opp-learn 涉及 nacos 配置读取时优先复用公共配置接口',
      annotationIds: [],
      capturedAt: now
    }
  };
}

describe('memory services', () => {
  it('从已消费技术方案输入生成候选并确认成项目记忆', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-'));
    const candidates = await extractMemoryCandidatesForDesignRun(root, workflow(), designRun(), '10');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].status).toBe('PENDING_CONFIRM');

    const repository = new MemoryRepository(root);
    const card = await repository.confirmCandidate(candidates[0].id);
    expect(card.status).toBe('ACTIVE');
    expect(card.evidence[0].runId).toBe('run-design-1');
  });

  it('从交付复盘产物导入候选经验并更新复盘摘要', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-retrospective-'));
    const item = workflow();
    item.currentStage = 'RETROSPECTIVE';
    item.stages.PRD.status = 'APPROVED';
    item.stages.TECH_DESIGN.status = 'APPROVED';
    item.stages.IMPLEMENTATION.status = 'APPROVED';
    item.stages.CODE_REVIEW.status = 'APPROVED';
    item.stages.RETROSPECTIVE.status = 'DRAFT';
    const dir = retrospectiveDir(item.requirementId);
    await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(path.join(root, retrospectiveSummaryPath(item.requirementId)), '# 交付复盘\n', 'utf8');
    await fs.writeFile(
      path.join(root, retrospectiveEvidencePath(item.requirementId)),
      JSON.stringify({
        version: 1,
        requirementId: item.requirementId,
        items: [
          {
            id: 'evidence-1',
            sourceType: 'CLARIFICATION',
            requirementId: item.requirementId,
            path: 'docs/174705/technical-design/questions/20260710-question.md',
            quote: '生成方案时需要参考 opp-learn 的 nacos 配置读取约束'
          }
        ]
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, retrospectiveCandidatesPath(item.requirementId)),
      JSON.stringify({
        version: 1,
        requirementId: item.requirementId,
        items: [
          {
            statement: 'opp-learn 涉及 nacos 配置读取时，优先复用公共配置接口',
            type: 'TECH_EXPERIENCE',
            tags: ['nacos', '配置'],
            appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
            sourceText: '复盘确认该约束可沉淀为后续技术方案经验',
            evidence: [
              {
                sourceType: 'RETROSPECTIVE',
                requirementId: item.requirementId,
                path: retrospectiveSummaryPath(item.requirementId),
                quote: '复盘确认该约束可沉淀为后续技术方案经验',
                runId: 'run-retrospective-1'
              }
            ]
          }
        ]
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, retrospectiveRecallFeedbackPath(item.requirementId)),
      JSON.stringify({
        version: 1,
        requirementId: item.requirementId,
        items: [
          {
            memoryId: 'memory-1',
            status: 'EFFECTIVE',
            reason: '引用内容被技术方案吸收'
          }
        ]
      }),
      'utf8'
    );

    const now = new Date().toISOString();
    const result = await importRetrospectiveRunOutputs(
      root,
      item,
      {
        id: 'run-retrospective-1',
        requirementId: item.requirementId,
        actionType: 'RETROSPECTIVE_GENERATE',
        stage: 'RETROSPECTIVE',
        status: 'SUCCEEDED',
        startedAt: now,
        finishedAt: now,
        params: {}
      },
      '10'
    );
    const repository = new MemoryRepository(root);
    const candidates = await repository.listCandidates({ projectId: '10', requirementId: item.requirementId });

    expect(result.importedCandidateCount).toBe(1);
    expect(result.workflow.stages.RETROSPECTIVE.status).toBe('READY_FOR_REVIEW');
    expect(result.workflow.retrospective?.candidateCount).toBe(1);
    expect(result.workflow.retrospective?.pendingCandidateCount).toBe(1);
    expect(result.workflow.retrospective?.recallFeedbackCount).toBe(1);
    expect(candidates.items[0].sourceType).toBe('RETROSPECTIVE');
  });

  it('复盘摘要会兜底导入已生成但未入库的候选经验文件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-retrospective-summary-import-'));
    const item = workflow();
    item.currentStage = 'RETROSPECTIVE';
    item.stages.RETROSPECTIVE.status = 'DRAFT';
    const dir = retrospectiveDir(item.requirementId);
    await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(path.join(root, retrospectiveSummaryPath(item.requirementId)), '# 交付复盘\n', 'utf8');
    await fs.writeFile(
      path.join(root, retrospectiveCandidatesPath(item.requirementId)),
      JSON.stringify({
        version: 1,
        requirementId: item.requirementId,
        items: [
          {
            statement: '学习排行榜中 self.inTop50 只用于当前筛选周期与维度',
            type: 'BUSINESS_RULE',
            confidence: 0.94,
            tags: ['member-points-rank'],
            appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN', 'IMPLEMENTATION'] },
            sourceText: '复盘候选文件已生成但尚未进入候选仓库',
            evidence: [
              {
                sourceType: 'DESIGN',
                requirementId: item.requirementId,
                path: 'docs/174705/technical-design/design_review.md',
                quote: 'self.inTop50 表示本人是否进入当前筛选周期、当前筛选维度 TOP50。'
              }
            ]
          }
        ]
      }),
      'utf8'
    );

    const summary = await getRetrospectiveSummary(root, item, '10');
    const candidates = await new MemoryRepository(root).listCandidates({ projectId: '10', requirementId: item.requirementId });

    expect(summary.candidateCount).toBe(1);
    expect(summary.pendingCandidateCount).toBe(1);
    expect(candidates.items[0].statement).toContain('self.inTop50');
    expect(candidates.items[0].evidence[0].sourceType).toBe('RETROSPECTIVE');
  });

  it('缺少来源证据的候选不能确认沉淀', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-invalid-'));
    const repository = new MemoryRepository(root);
    const now = new Date().toISOString();
    const candidate = await repository.saveCandidate({
      id: 'cand-invalid',
      projectId: '10',
      requirementId: '174705',
      sourceKey: 'invalid',
      sourceType: 'CLARIFICATION',
      sourceRunId: '',
      sourceText: '无来源',
      statement: '无来源',
      type: 'TECH_EXPERIENCE',
      status: 'PENDING_CONFIRM',
      confidence: 0.5,
      tags: [],
      appliesTo: { modules: [], stages: ['TECH_DESIGN'] },
      evidence: [],
      createdAt: now,
      updatedAt: now
    });

    await expect(repository.confirmCandidate(candidate.id)).rejects.toThrow('来源信息不足');
  });

  it('支持编辑候选经验草稿且不会写入正式记忆', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-candidate-update-'));
    const repository = new MemoryRepository(root);
    const now = new Date().toISOString();
    const candidate = await repository.saveCandidate({
      id: 'cand-update',
      projectId: '10',
      requirementId: '174705',
      sourceKey: 'candidate-update',
      sourceType: 'RETROSPECTIVE',
      sourceRunId: 'run-retrospective-1',
      sourceText: '复盘确认该约束可沉淀',
      statement: '原候选经验',
      type: 'TECH_EXPERIENCE',
      status: 'PENDING_CONFIRM',
      confidence: 0.7,
      tags: ['nacos'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
      evidence: [
        {
          sourceType: 'RETROSPECTIVE',
          requirementId: '174705',
          path: 'docs/174705/retrospective/summary.md',
          quote: '复盘确认该约束可沉淀',
          runId: 'run-retrospective-1'
        }
      ],
      createdAt: now,
      updatedAt: now
    });

    const updated = await repository.updateCandidate(candidate.id, {
      statement: '编辑后的候选经验',
      tags: ['nacos', '人工修订']
    });

    expect(updated.statement).toBe('编辑后的候选经验');
    expect(updated.status).toBe('PENDING_CONFIRM');
    expect(updated.tags).toEqual(['nacos', '人工修订']);
    expect((await repository.listCards({ projectId: '10' })).items).toHaveLength(0);
  });

  it('候选经验待验证时不进入项目经验，验证后确认才沉淀为生效经验', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-candidate-pending-verify-'));
    const repository = new MemoryRepository(root);
    const now = new Date().toISOString();
    const candidate = await repository.saveCandidate({
      id: 'cand-pending-verify',
      projectId: '10',
      requirementId: '174705',
      sourceKey: 'candidate-pending-verify',
      sourceType: 'RETROSPECTIVE',
      sourceRunId: 'run-retrospective-1',
      sourceText: '复盘提出该规则仍需后续验证',
      statement: '候选经验待验证时不应进入项目经验',
      type: 'TECH_HYPOTHESIS',
      status: 'PENDING_CONFIRM',
      confidence: 0.45,
      tags: ['待验证'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] },
      evidence: [
        {
          sourceType: 'RETROSPECTIVE',
          requirementId: '174705',
          path: 'docs/174705/retrospective/summary.md',
          quote: '复盘提出该规则仍需后续验证',
          runId: 'run-retrospective-1'
        }
      ],
      createdAt: now,
      updatedAt: now
    });

    const pending = await repository.updateCandidateStatus(candidate.id, 'PENDING_VERIFY', '需要后续需求验证');
    expect(pending.status).toBe('PENDING_VERIFY');
    expect((await repository.listCards({ projectId: '10' })).items).toHaveLength(0);
    await expect(repository.confirmCandidate(candidate.id, { status: 'PENDING_VERIFY' })).rejects.toThrow('待验证候选不能通过确认接口进入项目经验');

    const card = await repository.confirmCandidate(candidate.id);
    expect(card.status).toBe('ACTIVE');
    expect((await repository.getCandidate(candidate.id)).status).toBe('CONFIRMED');
  });

  it('支持人工录入项目经验并作为 MANUAL 来源保存', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-manual-'));
    const repository = new MemoryRepository(root);
    const card = await repository.createManualCard({
      projectId: '10',
      requirementId: '174705',
      statement: '涉及 nacos 配置读取时，优先检查公共配置接口是否可复用',
      type: 'TECH_EXPERIENCE',
      status: 'ACTIVE',
      tags: ['nacos', '配置'],
      appliesTo: {
        modules: ['opp-learn'],
        stages: ['TECH_DESIGN']
      },
      evidenceQuote: '人工录入：团队约定优先复用公共配置接口'
    });

    expect(card.status).toBe('ACTIVE');
    expect(card.evidence[0].sourceType).toBe('MANUAL');
    expect(card.evidence[0].requirementId).toBe('174705');
    expect((await repository.listCards({ projectId: '10', keyword: 'nacos' })).items[0].id).toBe(card.id);
  });

  it('支持修改项目经验并保存修订快照', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-update-'));
    const repository = new MemoryRepository(root);
    const card = await repository.createManualCard({
      projectId: '10',
      statement: 'nacos 配置读取优先复用公共接口',
      type: 'TECH_EXPERIENCE',
      tags: ['nacos'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] }
    });

    const updated = await repository.updateCard(card.id, {
      statement: 'opp-learn 涉及 nacos 配置读取时，优先复用公共配置接口',
      status: 'PENDING_VERIFY',
      tags: ['nacos', '配置'],
      changeReason: '补充适用工程并先标记待验证'
    });
    const revisions = await repository.listCardRevisions(card.id);

    expect(updated.status).toBe('PENDING_VERIFY');
    expect(updated.statement).toContain('opp-learn');
    expect(revisions).toHaveLength(1);
    expect(revisions[0].before.statement).toBe(card.statement);
    expect(revisions[0].after.statement).toBe(updated.statement);
    expect(revisions[0].changeReason).toBe('补充适用工程并先标记待验证');
  });

  it('生成前召回只使用已确认生效的项目经验', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-active-only-'));
    const repository = new MemoryRepository(root);
    const pending = await repository.createManualCard({
      projectId: '10',
      requirementId: '174705',
      statement: '积分规则待验证经验不应进入生成前召回',
      type: 'TECH_HYPOTHESIS',
      status: 'PENDING_VERIFY',
      tags: ['积分规则'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] }
    });
    const active = await repository.createManualCard({
      projectId: '10',
      requirementId: '174705',
      statement: '积分规则已确认经验可以进入生成前召回',
      type: 'TECH_EXPERIENCE',
      status: 'ACTIVE',
      tags: ['积分规则'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] }
    });

    const results = await searchProjectMemory(root, workflow(), {
      projectId: '10',
      stage: 'TECH_DESIGN',
      title: '积分规则',
      keywords: ['积分规则']
    });
    const resultIds = results.map((item) => item.card.id);

    expect(resultIds).toContain(active.id);
    expect(resultIds).not.toContain(pending.id);
  });

  it('检索项目记忆并生成召回产物和台账', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-recall-'));
    const repository = new MemoryRepository(root);
    const [candidate] = await extractMemoryCandidatesForDesignRun(root, workflow(), designRun(), '10');
    await repository.confirmCandidate(candidate.id);

    const results = await searchProjectMemory(root, workflow(), { projectId: '10', stage: 'TECH_DESIGN' });
    expect(results[0].card.statement).toContain('nacos');

    const recall = await prepareMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      runId: 'run-next'
    });
    expect(recall.recallPath).toBe('docs/174705/memory-recall/run-next.md');
    const content = await fs.readFile(path.join(root, recall.recallPath || ''), 'utf8');
    expect(content).toContain('本次召回记忆');
    expect((await repository.readRecallLedger())[0].recallStatus).toBe('INJECTED');
  });

  it('产物已吸收的记忆会跳过重复召回并限制记忆路径范围', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-skip-'));
    const repository = new MemoryRepository(root);
    const [candidate] = await extractMemoryCandidatesForDesignRun(root, workflow(), designRun(), '10');
    const card = await repository.confirmCandidate(candidate.id);

    const firstRecall = await prepareMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      runId: 'run-first'
    });
    expect(firstRecall.records[0].recallStatus).toBe('INJECTED');
    await markMemoryRecallApplied(root, workflow(), {
      ...designRun(),
      id: 'run-first',
      status: 'SUCCEEDED'
    }, '10');
    await markMemoryRecallApplied(root, workflow(), {
      ...designRun(),
      id: 'run-first',
      status: 'SUCCEEDED'
    }, '10');
    const appliedRecords = (await repository.readRecallLedger()).filter((record) => record.runId === 'run-first' && record.recallStatus === 'APPLIED');
    expect(appliedRecords).toHaveLength(1);

    const designPath = path.join(root, 'docs/174705/technical-design/design_review.md');
    await fs.mkdir(path.dirname(designPath), { recursive: true });
    await fs.writeFile(designPath, `# 技术方案\n\n${card.statement}\n`, 'utf8');

    const secondRecall = await prepareMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      runId: 'run-second'
    });
    expect(secondRecall.recallPath).toBeUndefined();
    expect(secondRecall.records[0].recallStatus).toBe('SKIPPED_ALREADY_APPLIED');
    expect(() => assertMemoryPath(root, '../outside.json')).toThrow('记忆路径不允许访问');
  });

  it('项目记忆更新后会重新召回并记录 UPDATED_RECALL', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-updated-recall-'));
    const repository = new MemoryRepository(root);
    const [candidate] = await extractMemoryCandidatesForDesignRun(root, workflow(), designRun(), '10');
    const card = await repository.confirmCandidate(candidate.id);
    const firstRecall = await prepareMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      runId: 'run-first'
    });
    expect(firstRecall.records[0].recallStatus).toBe('INJECTED');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repository.updateCard(card.id, {
      statement: `${card.statement}，且需要检查公共接口是否覆盖权限边界`,
      changeReason: '补充权限边界提醒'
    });

    const recall = await prepareMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      runId: 'run-second'
    });

    expect(recall.records[0].recallStatus).toBe('UPDATED_RECALL');
  });

  it('召回预览不写台账，确认后才注入选中记忆', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-preview-'));
    const repository = new MemoryRepository(root);
    const card = await repository.createManualCard({
      projectId: '10',
      requirementId: '174705',
      statement: '涉及 nacos 配置读取时，优先复用公共配置接口',
      type: 'TECH_EXPERIENCE',
      tags: ['nacos', '配置'],
      appliesTo: { modules: ['opp-learn'], stages: ['TECH_DESIGN'] }
    });
    const sourcePath = path.join(root, 'docs/174705/prd/analysis.md');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, '# PRD\n\n本次涉及 nacos 配置读取，需要复用公共配置接口。', 'utf8');

    const preview = await previewMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      sourceFilePaths: ['docs/174705/prd/analysis.md'],
      runIntent: '生成技术方案'
    });

    expect(preview.items[0].memoryId).toBe(card.id);
    expect(await repository.readRecallLedger()).toHaveLength(0);

    const confirmed = await confirmMemoryRecallForRun(root, workflow(), {
      projectId: '10',
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      runId: 'run-confirm',
      previewId: preview.previewId,
      selectedMemoryIds: [card.id],
      dismissed: [],
      sourceFilePaths: ['docs/174705/prd/analysis.md']
    });

    expect(confirmed.recallPath).toBe('docs/174705/memory-recall/run-confirm.md');
    expect((await repository.readRecallLedger())[0].recallStatus).toBe('INJECTED');
  });

  it('QueryProfile 会过滤历史召回产物并生成稳定哈希', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-memory-profile-'));
    await fs.mkdir(path.join(root, 'docs/174705/prd'), { recursive: true });
    await fs.mkdir(path.join(root, 'docs/174705/memory-recall'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs/174705/prd/analysis.md'), '# 规则\n\n必须复用公共配置接口。\n\n涉及 OppLearnConfigService。', 'utf8');
    await fs.writeFile(path.join(root, 'docs/174705/memory-recall/old.md'), '历史召回噪音', 'utf8');

    const profile = await buildMemoryQueryProfile(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      sourceFilePaths: ['docs/174705/prd/analysis.md', 'docs/174705/memory-recall/old.md'],
      runIntent: '生成技术方案'
    });

    expect(profile.constraints.join(' ')).toContain('必须复用公共配置接口');
    expect(profile.technicalEntities).toContain('OppLearnConfigService');
    expect(profile.sourceSnippets.join(' ')).not.toContain('历史召回噪音');
    expect(profile.sourceHash).toHaveLength(64);
    expect(profile.queryProfileHash).toHaveLength(64);
  });
});
