import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RequirementWorkflow } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { buildActionCommand, executeAction, validateActionInput } from '../../server/services/action-adapters';

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    branchName: 'feature/opp-172014',
    sources: ['https://example.feishu.cn/docx/xxx'],
    currentStage: 'PRD',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('action-adapters', () => {
  it('拒绝工作区外路径参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    expect(() =>
      validateActionInput(root, {
        actionType: 'DESIGN_GENERATE',
        params: { documentPath: '/etc/passwd' }
      })
    ).toThrow('路径不在工作区内');
    expect(() =>
      validateActionInput(root, {
        actionType: 'DESIGN_GENERATE',
        params: { sourceFiles: ['/etc/passwd'] }
      })
    ).toThrow('路径不在工作区内');
    expect(() =>
      validateActionInput(root, {
        actionType: 'OPENSPEC_FF',
        params: { prdDocumentPath: '/etc/passwd' }
      })
    ).toThrow('路径不在工作区内');
  });

  it('技能动作在无 Agent Bridge 时生成标准调用文本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), { actionType: 'PRD_ANALYZE', params: {} });
    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.stage).toBe('PRD');
    expect(run.commandText).toContain('/coding-prd-analyzer id=172014');
    expect(run.commandText).not.toContain(' c=');
  });

  it('命令预览只生成标准调用文本，不创建运行记录', () => {
    expect(
      buildActionCommand(workflow(), {
        actionType: 'PRD_ANALYZE',
        params: { description: '只覆盖后台', sources: ['docs/172014/prd/file/source.pdf'] }
      })
    ).toBe('/coding-prd-analyzer id=172014 c=只覆盖后台 docs/172014/prd/file/source.pdf');
    expect(
      buildActionCommand(workflow(), {
        actionType: 'OPENSPEC_STATUS',
        params: { changeName: 'req-172014' }
      })
    ).toBe('openspec status --change req-172014 --json');
    expect(
      buildActionCommand(workflow(), {
        actionType: 'OPENSPEC_NEW_CHANGE',
        params: { changeName: 'req-172014' }
      })
    ).toBe('openspec new change req-172014');
    expect(
      buildActionCommand(workflow(), {
        actionType: 'OPENSPEC_FF',
        params: {
          changeName: 'req-172014',
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          documentPath: 'docs/172014/technical-design/design_review.md'
        }
      })
    ).toBe('/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md');
  });

  it('技能动作支持本地终端执行模式', async () => {
    const previous = process.env.AI_DELIVERY_TERMINAL_DRY_RUN;
    process.env.AI_DELIVERY_TERMINAL_DRY_RUN = '1';
    try {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
      const run = await executeAction(root, workflow(), {
        actionType: 'PRD_ANALYZE',
        params: { agentId: 'codex', executionMode: 'TERMINAL', sources: [] }
      });

      expect(run.status).toBe('TERMINAL_OPENED');
      expect(run.executionMode).toBe('TERMINAL');
      expect(run.promptPath).toBeTruthy();
      expect(run.terminalScriptPath).toMatch(/\.command$/);
      expect(run.terminalTranscriptPath).toContain('.terminal.log');
      expect(run.terminalStatusPath).toContain('.terminal-status.json');
    } finally {
      if (previous === undefined) {
        delete process.env.AI_DELIVERY_TERMINAL_DRY_RUN;
      } else {
        process.env.AI_DELIVERY_TERMINAL_DRY_RUN = previous;
      }
    }
  });

  it('技能动作支持交互终端执行模式', async () => {
    const previous = process.env.AI_DELIVERY_TERMINAL_DRY_RUN;
    process.env.AI_DELIVERY_TERMINAL_DRY_RUN = '1';
    try {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
      const run = await executeAction(root, workflow(), {
        actionType: 'PRD_ANALYZE',
        params: { agentId: 'codex', executionMode: 'INTERACTIVE_TERMINAL', sources: [] }
      });

      expect(run.status).toBe('TERMINAL_OPENED');
      expect(run.executionMode).toBe('INTERACTIVE_TERMINAL');
      expect(run.promptPath).toBeTruthy();
      expect(run.terminalScriptPath).toMatch(/\.command$/);
      expect(run.terminalTranscriptPath).toContain('.terminal.log');
      expect(run.terminalStatusPath).toContain('.terminal-status.json');

      const script = await fs.readFile(path.join(root, run.terminalScriptPath || ''), 'utf8');
      expect(script).toContain("EXECUTION_MODE='INTERACTIVE_TERMINAL'");
      expect(script).toContain("EXECUTION_MODE_LABEL='交互终端'");
    } finally {
      if (previous === undefined) {
        delete process.env.AI_DELIVERY_TERMINAL_DRY_RUN;
      } else {
        process.env.AI_DELIVERY_TERMINAL_DRY_RUN = previous;
      }
    }
  });

  it('PRD 分析显式填写描述时传递 c 参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'PRD_ANALYZE',
      params: { description: '  仅覆盖后台端\n暂不包含用户端  ', sources: [] }
    });
    expect(run.commandText).toContain('c=仅覆盖后台端 暂不包含用户端');
  });

  it('PRD 分析未填写描述时不使用标题兜底', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'PRD_ANALYZE',
      params: { description: '', sources: [] }
    });
    expect(run.commandText).toBe('/coding-prd-analyzer id=172014');
  });

  it('PRD 分析可复用 workflow 中已保存的澄清描述', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      prdClarification: '本期只覆盖后台配置'
    };
    const run = await executeAction(root, current, {
      actionType: 'PRD_ANALYZE',
      params: { sources: [] }
    });
    expect(run.commandText).toBe('/coding-prd-analyzer id=172014 c=本期只覆盖后台配置');
  });

  it('单元测试生成不会复用 PRD 澄清描述', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      prdClarification: '本期只覆盖后台配置'
    };
    const run = await executeAction(root, current, {
      actionType: 'JUNIT_GENERATE',
      params: { moduleName: 'opp-diy' }
    });
    expect(run.commandText).toBe('generate-unit-test opp-diy');
  });

  it('技术方案生成支持 d 和 c 参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      params: {
        documentPath: 'docs/172014/prd/analysis.md',
        clarification: '补充接口性能要求'
      }
    });
    expect(run.commandText).toContain('/coding-design');
    expect(run.stage).toBe('TECH_DESIGN');
    expect(run.commandText).toContain('d=docs/172014/prd/analysis.md');
    expect(run.commandText).toContain('r=172014');
    expect(run.commandText).toContain('c=补充接口性能要求');
  });

  it('技术方案生成把补充材料追加到 d 参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      params: {
        documentPath: 'docs/172014/prd/analysis.md',
        sourceFiles: ['docs/172014/technical-design/file/file-a.pdf', 'docs/172014/technical-design/file/file-b.png']
      }
    });
    expect(run.commandText).toContain(
      'd=docs/172014/prd/analysis.md,docs/172014/technical-design/file/file-a.pdf,docs/172014/technical-design/file/file-b.png'
    );
    expect(run.commandText).toContain('r=172014');
  });

  it('技术方案生成默认使用 workflow 中的补充材料', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      techDesignSourceFiles: [
        {
          id: 'file-1',
          name: '旧方案.md',
          path: 'docs/172014/technical-design/file/file-1-old-design.md',
          size: 10,
          uploadedAt: '2026-05-27T00:00:00.000Z'
        }
      ]
    };
    const run = await executeAction(root, current, {
      actionType: 'DESIGN_GENERATE',
      params: {
        documentPath: 'docs/172014/prd/analysis.md'
      }
    });
    expect(run.commandText).toContain('d=docs/172014/prd/analysis.md,docs/172014/technical-design/file/file-1-old-design.md');
  });

  it('技术方案生成未填写 c 参数时不添加 c', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      params: {
        documentPath: 'docs/172014/prd/analysis.md'
      }
    });
    expect(run.commandText).toContain('/coding-design');
    expect(run.commandText).toContain('d=docs/172014/prd/analysis.md');
    expect(run.commandText).toContain('r=172014');
    expect(run.commandText).not.toContain(' c=');
  });

  it('技术方案生成把涉及工程作为 p 参数传入', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      projects: [
        { name: 'opp-gateway', path: 'opp-gateway' },
        { name: 'opp-learn', path: 'opp-learn' }
      ]
    };
    const run = await executeAction(root, current, {
      actionType: 'DESIGN_GENERATE',
      params: {
        documentPath: 'docs/172014/prd/analysis.md'
      }
    });
    expect(run.commandText).toContain('p=opp-gateway,opp-learn');
  });

  it('技术方案生成使用默认文档路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      params: {}
    });
    expect(run.commandText).toContain('/coding-design');
    expect(run.commandText).toContain('d=docs/172014/prd/analysis.md');
    expect(run.commandText).toContain('r=172014');
  });

  it('技术方案生成未显式传 d 时优先使用 PRD 产物路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      artifacts: [
        {
          id: 'prd-analysis',
          stage: 'PRD' as const,
          label: 'PRD 分析文档',
          path: 'docs/legacy-prd/172014/analysis.md',
          kind: 'markdown' as const,
          exists: true
        }
      ]
    };
    const run = await executeAction(root, current, {
      actionType: 'DESIGN_GENERATE',
      params: {}
    });
    expect(run.commandText).toContain('/coding-design');
    expect(run.commandText).toContain('d=docs/legacy-prd/172014/analysis.md');
    expect(run.commandText).toContain('r=172014');
  });

  it('OpenSpec 归档使用 archive 技能并归属代码评审阶段', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'OPENSPEC_ARCHIVE',
      params: { changeName: 'req-172014' }
    });
    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.stage).toBe('CODE_REVIEW');
    expect(run.commandText).toBe('/openspec-archive-change req-172014');
  });

  it('OpenSpec 开始变更执行 new change 并归属开始变更子步骤', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const run = await executeAction(root, workflow(), {
      actionType: 'OPENSPEC_NEW_CHANGE',
      params: { changeName: 'req-172014' }
    });
    expect(run.stage).toBe('IMPLEMENTATION');
    expect(run.implementationStep).toBe('START_CHANGE');
  });

  it('OpenSpec 工件生成带上 PRD 与技术方案文档并归属工件评审子步骤', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      stages: {
        ...workflow().stages,
        TECH_DESIGN: {
          ...workflow().stages.TECH_DESIGN,
          artifactPath: 'docs/172014/technical-design/design_review.md'
        }
      }
    };
    const run = await executeAction(root, current, {
      actionType: 'OPENSPEC_FF',
      params: { changeName: 'req-172014' }
    });
    expect(run.stage).toBe('IMPLEMENTATION');
    expect(run.implementationStep).toBe('ARTIFACT_REVIEW');
    expect(run.commandText).toBe('/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md');
  });

  it('OpenSpec 工件生成未显式传 PRD 时优先使用 PRD 产物路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-action-'));
    const current = {
      ...workflow(),
      artifacts: [
        {
          id: 'prd-analysis',
          stage: 'PRD' as const,
          label: 'PRD 分析文档',
          path: 'docs/legacy-prd/172014/analysis.md',
          kind: 'markdown' as const,
          exists: true
        }
      ]
    };
    const run = await executeAction(root, current, {
      actionType: 'OPENSPEC_FF',
      params: {
        changeName: 'req-172014',
        documentPath: 'docs/172014/technical-design/design_review.md'
      }
    });
    expect(run.commandText).toBe('/openspec-ff-change req-172014 d=docs/legacy-prd/172014/analysis.md,docs/172014/technical-design/design_review.md');
  });
});
