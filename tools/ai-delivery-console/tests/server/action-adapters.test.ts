import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import type { AgentProvider, ArtifactRef, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import {
  assertPrdClarificationReady,
  executeAction,
  internalForTests
} from '../../server/services/action-adapters';
import {
  cancelAgentRun,
  createPromptEnvelope,
  createTerminalRunScript,
  interactiveTerminalCommandLine,
  listAgentProviders,
  refreshTerminalRunStatuses,
  startAgentProcess,
  terminalCommandLine
} from '../../server/services/agent-providers';
import { readRunEvents } from '../../server/services/run-log';
import { resolveWorkspaceOrRuntimePath } from '../../server/services/runtime-paths';
import { createTechDesignDraftSnapshot } from '../../server/services/tech-design-versions';
import { serverConfig } from '../../server/config';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await exec('git', args, { cwd });
}

function workflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    requirementId: '172014',
    title: '定位菜单',
    branchName: 'feature/opp-172014',
    sources: [],
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

function openSpecArtifact(id: string, pathValue: string, overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id,
    stage: 'IMPLEMENTATION',
    label: id,
    path: pathValue,
    kind: pathValue.endsWith('.md') ? 'markdown' : 'directory',
    exists: true,
    ...overrides
  };
}

function completeOpenSpecArtifacts(overrides: Partial<ArtifactRef>[] = []): ArtifactRef[] {
  const base = [
    openSpecArtifact('openspec-change', 'openspec/changes/req-172014'),
    openSpecArtifact('openspec-proposal', 'openspec/changes/req-172014/proposal.md'),
    openSpecArtifact('openspec-design', 'openspec/changes/req-172014/design.md'),
    openSpecArtifact('openspec-tasks', 'openspec/changes/req-172014/tasks.md'),
    openSpecArtifact('openspec-spec-1', 'openspec/changes/req-172014/specs/main/spec.md')
  ];
  return base.map((artifact, index) => ({ ...artifact, ...(overrides[index] || {}) }));
}

function runRecord(id: string): RunRecord {
  return {
    id,
    requirementId: '172014',
    actionType: 'PRD_ANALYZE',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    params: {},
    agentId: 'test-agent'
  };
}

describe('action-adapters', () => {
  it('Center 需求中的 Codex 动作先创建精确 Run，再上传 token 并完成 Job', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-center-run-'));
    const originalProvidersJson = serverConfig.agentProvidersJson;
    serverConfig.agentProvidersJson = JSON.stringify([
      {
        id: 'codex',
        name: 'Test Codex',
        inputMode: 'PROMPT_FILE',
        command: [
          process.execPath,
          '-e',
          'console.log(JSON.stringify({type:"turn.completed",id:"turn-1",usage:{input_tokens:10,cached_input_tokens:4,output_tokens:2,reasoning_output_tokens:1}}));'
        ],
        available: true,
        supportsStreaming: true
      }
    ]);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/api/ai-delivery/jobs')) {
        return response({ id: 500, requirementPk: 100, actionType: 'PRD_ANALYZE', status: 'QUEUED' });
      }
      if (url.endsWith('/api/ai-delivery/jobs/500/claim')) {
        return response({ id: 500, requirementPk: 100, actionType: 'PRD_ANALYZE', status: 'CLAIMED', runId: 900 });
      }
      if (url.endsWith('/api/ai-delivery/run-token-usages')) {
        return response({ detail: { id: 1 } });
      }
      if (url.endsWith('/api/ai-delivery/jobs/500/complete')) {
        return response({ id: 500, status: 'SUCCEEDED', runId: 900 });
      }
      return response({});
    });
    const item = { ...workflow(), id: 100 };
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });

    try {
      const started = await executeAction(
        root,
        item,
        {
          actionType: 'PRD_ANALYZE',
          params: { agentId: 'codex', executionMode: 'BACKGROUND' }
        },
        async (run) => resolveUpdate(run),
        {
          centerConfig: {
            centerBaseUrl: 'http://127.0.0.1:8728',
            userId: 1,
            clientSessionId: 10,
            fetchImpl: fetchImpl as unknown as typeof fetch
          }
        }
      );
      const completed = await updatedPromise;

      expect(started.centerJobId).toBe(500);
      expect(started.centerRunId).toBe(900);
      expect(completed.status).toBe('SUCCEEDED');
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
        'http://127.0.0.1:8728/api/ai-delivery/jobs',
        'http://127.0.0.1:8728/api/ai-delivery/jobs/500/claim',
        'http://127.0.0.1:8728/api/ai-delivery/run-token-usages',
        'http://127.0.0.1:8728/api/ai-delivery/jobs/500/complete'
      ]));
      const usageCall = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/run-token-usages'));
      expect(String(usageCall?.[1]?.body)).toContain('"runId":900');
    } finally {
      serverConfig.agentProvidersJson = originalProvidersJson;
    }
  });

  it('Center Run 建立失败时阻止 Codex 启动', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-center-run-'));
    const markerPath = path.join(root, 'agent-started.txt');
    const originalProvidersJson = serverConfig.agentProvidersJson;
    serverConfig.agentProvidersJson = JSON.stringify([
      {
        id: 'codex',
        name: 'Test Codex',
        inputMode: 'PROMPT_FILE',
        command: [process.execPath, '-e', `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "started")`],
        available: true,
        supportsStreaming: true
      }
    ]);

    try {
      const run = await executeAction(
        root,
        { ...workflow(), id: 100 },
        {
          actionType: 'PRD_ANALYZE',
          params: { agentId: 'codex', executionMode: 'BACKGROUND' }
        },
        async () => undefined,
        {
          centerConfig: {
            centerBaseUrl: 'http://127.0.0.1:8728',
            userId: 1,
            clientSessionId: 10,
            fetchImpl: (async () => ({
              ok: false,
              json: async () => ({ success: false, message: 'center down' })
            })) as unknown as typeof fetch
          }
        }
      );

      expect(run.status).toBe('FAILED');
      expect(run.error).toContain('已阻止 Codex 启动');
      await expect(fs.access(markerPath)).rejects.toThrow();
    } finally {
      serverConfig.agentProvidersJson = originalProvidersJson;
    }
  });

  it('生成 PRD 澄清命令时携带 workflow 来源参数', () => {
    const item = {
      ...workflow(),
      sources: ['https://prd.example.com/doc'],
      prdSourceFiles: [
        {
          id: 'source-1',
          name: '来源.pdf',
          path: 'docs/172014/prd/files/source-1.pdf',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'PRD_CLARIFY',
        params: {
          description: '补充异常场景'
        }
      })
    ).toBe('/coding-prd-analyzer id=172014 c=补充异常场景 https://prd.example.com/doc');
  });

  it('生成 PRD 澄清命令时优先携带本次 sources 或 sourceFiles', () => {
    const item = {
      ...workflow(),
      sources: ['https://prd.example.com/old']
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'PRD_CLARIFY',
        params: {
          description: '补充异常场景',
          sources: ['docs/172014/prd/files/new-source.png']
        }
      })
    ).toBe('/coding-prd-analyzer id=172014 c=补充异常场景 docs/172014/prd/files/new-source.png');

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'PRD_CLARIFY',
        params: {
          description: '补充异常场景',
          sourceFiles: ['docs/172014/prd/files/from-source-files.md']
        }
      })
    ).toBe('/coding-prd-analyzer id=172014 c=补充异常场景 docs/172014/prd/files/from-source-files.md');
  });

  it('执行 PRD 生成时将长补充输入写入快照并用短引用生成命令', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-prd-supplement-snapshot-'));
    const longText = '复制活动编辑保存创建新的活动置顶后查看数据情况：\n'.repeat(20);

    const run = await executeAction(root, workflow(), {
      actionType: 'PRD_ANALYZE',
      params: {
        description: longText,
        supplementBlocks: [
          { id: 'paragraph-1', type: 'PARAGRAPH', text: longText },
          {
            id: 'image-1',
            type: 'IMAGE',
            fileId: 'file-1',
            name: 'pasted.png',
            path: 'docs/172014/prd/files/pasted.png',
            size: 107500,
            caption: '接口返回截图'
          }
        ],
        sources: ['https://prd.example.com/doc'],
        agentId: 'missing-agent'
      }
    });

    expect(run.status).toBe('WAITING_FOR_AGENT');
    const snapshotPath = String(run.params.supplementInputPath);
    expect(snapshotPath).toMatch(/^docs\/172014\/prd\/inputs\/supplements\/\d{14}-prd_analyze-run-.+\.md$/);
    expect(run.params.description).toBe(`补充输入见 ${snapshotPath}`);
    expect(run.params.sources).toEqual(['https://prd.example.com/doc']);
    expect(run.commandText).toContain(`c=补充输入见 ${snapshotPath}`);
    expect(run.commandText).not.toContain('复制活动编辑保存创建新的活动置顶后查看数据情况');

    const snapshotContent = await fs.readFile(path.join(root, snapshotPath), 'utf8');
    expect(snapshotContent).toContain('运行 ID:');
    expect(snapshotContent).toContain('动作: PRD_ANALYZE');
    expect(snapshotContent).toContain('复制活动编辑保存创建新的活动置顶后查看数据情况');
    expect(snapshotContent).toContain('![接口返回截图](docs/172014/prd/files/pasted.png)');
    expect(snapshotContent).toContain('附件清单');
  });

  it('执行技术方案生成时将长补充说明从 commandText 中替换为快照路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-design-supplement-snapshot-'));
    const longText = '请按照最新答疑刷新技术方案，并重点说明保存接口的幂等逻辑。'.repeat(18);

    const run = await executeAction(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      params: {
        clarification: longText,
        sourceFiles: ['docs/172014/technical-design/files/source.png'],
        supplementBlocks: [
          { id: 'paragraph-1', type: 'PARAGRAPH', text: longText },
          {
            id: 'file-1',
            type: 'FILE',
            fileId: 'file-1',
            name: '接口日志.txt',
            path: 'docs/172014/technical-design/files/api-log.txt',
            size: 2048,
            caption: '失败请求日志'
          }
        ],
        agentId: 'missing-agent'
      }
    });

    expect(run.status).toBe('WAITING_FOR_AGENT');
    const snapshotPath = String(run.params.supplementInputPath);
    expect(snapshotPath).toMatch(/^docs\/172014\/technical-design\/inputs\/supplements\/\d{14}-design_generate-run-.+\.md$/);
    expect(run.params.clarification).toBe(`补充输入见 ${snapshotPath}`);
    expect(run.params.sourceFiles).toEqual(['docs/172014/technical-design/files/source.png']);
    expect(run.commandText).toContain(snapshotPath);
    expect(run.commandText).not.toContain('请按照最新答疑刷新技术方案');

    const snapshotContent = await fs.readFile(path.join(root, snapshotPath), 'utf8');
    expect(snapshotContent).toContain('动作: DESIGN_GENERATE');
    expect(snapshotContent).toContain(longText);
    expect(snapshotContent).toContain('[补充文件: 接口日志.txt](docs/172014/technical-design/files/api-log.txt)');
    expect(snapshotContent).toContain('说明: 失败请求日志');
  });

  it('执行技术方案生成时内联图片只留在快照中，不重复进入 d 参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-design-inline-snapshot-'));
    const inlineImagePath = 'docs/172014/technical-design/files/pasted-20260717090000-1.png';

    const run = await executeAction(root, workflow(), {
      actionType: 'DESIGN_GENERATE',
      params: {
        clarification: '补充截图上下文',
        sourceFiles: [],
        supplementBlocks: [
          { id: 'paragraph-1', type: 'PARAGRAPH', text: '补充截图上下文' },
          {
            id: 'image-1',
            type: 'IMAGE',
            fileId: 'file-1',
            name: 'pasted-20260717090000-1.png',
            path: inlineImagePath,
            size: 1024,
            caption: '截图上下文',
            contextRole: 'INLINE'
          }
        ],
        agentId: 'missing-agent'
      }
    });

    const snapshotPath = String(run.params.supplementInputPath);
    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.commandText).toContain(`c=补充输入见 ${snapshotPath}`);
    expect(run.commandText).not.toContain(inlineImagePath);
    const snapshotContent = await fs.readFile(path.join(root, snapshotPath), 'utf8');
    expect(snapshotContent).toContain(`![截图上下文](${inlineImagePath})`);
  });

  it('PRD 澄清校验要求普通需求、非空描述和已存在 PRD 文档', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-prd-clarify-'));
    const item = workflow();

    await expect(
      assertPrdClarificationReady(root, item, {
        actionType: 'PRD_CLARIFY',
        params: { description: '补充异常场景' }
      })
    ).rejects.toThrow('请先生成 PRD 文档');

    await fs.mkdir(path.join(root, 'docs', '172014', 'prd'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', '172014', 'prd', 'analysis.md'), '# PRD');

    await expect(
      assertPrdClarificationReady(root, item, {
        actionType: 'PRD_CLARIFY',
        params: { description: '   ' }
      })
    ).rejects.toThrow('请输入 PRD 澄清描述');

    await expect(
      assertPrdClarificationReady(
        root,
        { ...item, requirementType: 'DEFECT' },
        {
          actionType: 'PRD_CLARIFY',
          params: { description: '补充异常场景' }
        }
      )
    ).rejects.toThrow('缺陷类型不支持 PRD 澄清');

    await expect(
      assertPrdClarificationReady(root, item, {
        actionType: 'PRD_CLARIFY',
        params: { description: '补充异常场景' }
      })
    ).resolves.toBeUndefined();
  });

  it('PRD 澄清执行在校验失败时不创建运行记录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-prd-clarify-run-'));
    await expect(
      executeAction(root, workflow(), {
        actionType: 'PRD_CLARIFY',
        params: { description: '补充异常场景' }
      })
    ).rejects.toThrow('请先生成 PRD 文档');

    const eventsDir = path.join(root, 'docs', '172014', 'workflow', 'runs');
    await expect(fs.readdir(eventsDir)).rejects.toThrow();
  });

  it('普通需求生成技术方案命令时保留 PRD 文档上下文', () => {
    const item = {
      ...workflow(),
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '补充图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    expect(internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} })).toBe(
      '/coding-design d=docs/172014/prd/analysis.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
  });

  it('普通需求再次生成技术方案命令时携带已有评审文档', () => {
    const item = {
      ...workflow(),
      artifacts: [
        {
          id: 'technical-design',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案评审文档',
          path: 'docs/172014/technical-design/design_review.md',
          kind: 'markdown' as const,
          exists: true
        }
      ],
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '补充图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    expect(internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} })).toBe(
      '/coding-design d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
  });

  it('普通需求生成技术方案命令时将答疑记录放在上传补充材料之前', () => {
    const item = {
      ...workflow(),
      artifacts: [
        {
          id: 'technical-design-questions',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案答疑记录',
          path: 'docs/172014/technical-design/questions.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-question-1',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案答疑 20260604-173000-question',
          path: 'docs/172014/technical-design/questions/20260604-173000-question.md',
          kind: 'markdown' as const,
          exists: true
        }
      ],
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '补充图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    expect(internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} })).toBe(
      '/coding-design d=docs/172014/prd/analysis.md,docs/172014/technical-design/questions/20260604-173000-question.md,docs/172014/technical-design/questions.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
  });

  it('普通需求再次生成技术方案命令时不再自动携带本地批注摘要', () => {
    const item = {
      ...workflow(),
      artifacts: [
        {
          id: 'technical-design',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案评审文档',
          path: 'docs/172014/technical-design/design_review.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-annotations',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案批注记录',
          path: 'docs/172014/technical-design/annotations/comments.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-questions',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案答疑记录',
          path: 'docs/172014/technical-design/questions.md',
          kind: 'markdown' as const,
          exists: true
        }
      ],
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '补充图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    expect(internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} })).toBe(
      '/coding-design d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md,docs/172014/technical-design/questions.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
  });

  it('普通需求再次生成技术方案命令时过滤已消费答疑记录', () => {
    const item = {
      ...workflow(),
      techDesignConsumedQuestionPaths: ['docs/172014/technical-design/questions/20260604-173000-question.md'],
      artifacts: [
        {
          id: 'technical-design',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案评审文档',
          path: 'docs/172014/technical-design/design_review.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-question-1',
          stage: 'TECH_DESIGN' as const,
          label: '已消费答疑',
          path: 'docs/172014/technical-design/questions/20260604-173000-question.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-question-2',
          stage: 'TECH_DESIGN' as const,
          label: '新增答疑',
          path: 'docs/172014/technical-design/questions/20260605-101500-question.md',
          kind: 'markdown' as const,
          exists: true
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, {
      actionType: 'DESIGN_GENERATE',
      params: {
        sourceFiles: [
          'docs/172014/technical-design/questions/20260604-173000-question.md',
          'docs/172014/technical-design/questions/20260605-101500-question.md',
          'docs/172014/technical-design/files/source-1.png'
        ]
      }
    });

    expect(command).toBe(
      '/coding-design d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md,docs/172014/technical-design/questions/20260605-101500-question.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
    expect(command).not.toContain('20260604-173000-question.md');
  });

  it('生成技术方案答疑命令并默认使用独立输出路径', () => {
    const item = {
      ...workflow(),
      projects: [
        { name: 'opp-api', path: 'opp-api' },
        { name: 'opp-learn', path: 'opp-learn' }
      ]
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'DESIGN_QUESTION',
        params: {
          question: '为什么需要缓存',
          prdDocumentPath: 'docs/172014/prd/analysis.md',
          designDocumentPath: 'docs/172014/technical-design/design_review.md'
        }
      })
    ).toMatch(
      /^\/coding-design-question r=172014 q=为什么需要缓存 d=docs\/172014\/prd\/analysis\.md,docs\/172014\/technical-design\/design_review\.md p=opp-api,opp-learn o=docs\/172014\/technical-design\/questions\/\d{8}-\d{6}-\d{3}-question\.md$/
    );
  });

  it('缺陷生成技术方案答疑命令时不自动携带 PRD 文档路径', () => {
    const item = {
      ...workflow(),
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT')
    };

    const command = internalForTests.buildSkillCommand(item, {
      actionType: 'DESIGN_QUESTION',
      params: {
        question: '为什么不补偿历史数据',
        designDocumentPath: 'docs/172014/technical-design/design_review.md'
      }
    });

    expect(command).toMatch(
      /^\/coding-design-question r=172014 q=为什么不补偿历史数据 d=docs\/172014\/technical-design\/design_review\.md o=docs\/172014\/technical-design\/questions\/\d{8}-\d{6}-\d{3}-question\.md$/
    );
    expect(command).not.toContain('/prd/');
  });

  it('执行技术方案答疑时把默认独立输出路径写入运行参数', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-design-question-'));
    const item = workflow();
    const run = await executeAction(root, item, {
      actionType: 'DESIGN_QUESTION',
      params: {
        question: '为什么需要缓存',
        designDocumentPath: 'docs/172014/technical-design/design_review.md',
        agentId: 'missing-agent'
      }
    });

    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.params.outputPath).toEqual(expect.stringMatching(/^docs\/172014\/technical-design\/questions\/\d{8}-\d{6}-\d{3}-question\.md$/));
    expect(run.commandText).toContain(String(run.params.outputPath));
  });

  it('缺陷生成技术方案命令不自动携带 PRD 文档路径', () => {
    const item = {
      ...workflow(),
      title: '邀请好友积分异常',
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      techDesignClarification: '后台配置为 1，实际奖励 10',
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} });

    expect(command).toBe('/coding-defect-design d=邀请好友积分异常,后台配置为 1，实际奖励 10,docs/172014/technical-design/files/source-1.png r=172014');
    expect(command).not.toContain('/prd/');
  });

  it('缺陷再次生成技术方案命令时携带已有评审文档且不自动携带 PRD', () => {
    const item = {
      ...workflow(),
      title: '邀请好友积分异常',
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      artifacts: [
        {
          id: 'technical-design',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案评审文档',
          path: 'docs/172014/technical-design/design_review.md',
          kind: 'markdown' as const,
          exists: true
        }
      ],
      techDesignClarification: '后台配置为 1，实际奖励 10',
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} });

    expect(command).toBe(
      '/coding-defect-design d=邀请好友积分异常,后台配置为 1，实际奖励 10,docs/172014/technical-design/design_review.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
    expect(command).not.toContain('/prd/');
  });

  it('缺陷再次生成技术方案命令时不再自动携带本地批注摘要', () => {
    const item = {
      ...workflow(),
      title: '邀请好友积分异常',
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      artifacts: [
        {
          id: 'technical-design',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案评审文档',
          path: 'docs/172014/technical-design/design_review.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-annotations',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案批注记录',
          path: 'docs/172014/technical-design/annotations/comments.md',
          kind: 'markdown' as const,
          exists: true
        },
        {
          id: 'technical-design-questions',
          stage: 'TECH_DESIGN' as const,
          label: '技术方案答疑记录',
          path: 'docs/172014/technical-design/questions.md',
          kind: 'markdown' as const,
          exists: true
        }
      ],
      techDesignClarification: '后台配置为 1，实际奖励 10',
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, { actionType: 'DESIGN_GENERATE', params: {} });

    expect(command).toBe(
      '/coding-defect-design d=邀请好友积分异常,后台配置为 1，实际奖励 10,docs/172014/technical-design/design_review.md,docs/172014/technical-design/questions.md,docs/172014/technical-design/files/source-1.png r=172014'
    );
    expect(command).not.toContain('/prd/');
  });

  it('普通需求 OpenSpec 快速生成命令不再默认携带 PRD 文件目录', () => {
    expect(internalForTests.buildSkillCommand(workflow(), { actionType: 'OPENSPEC_FF', params: {} })).toBe(
      '/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md'
    );
  });

  it('普通需求 OpenSpec 快速生成命令只携带显式选择的视觉上下文', () => {
    const command = internalForTests.buildSkillCommand(workflow(), {
      actionType: 'OPENSPEC_FF',
      params: {
        visualContextFiles: ['docs/172014/prd/files/menu.png'],
        openSpecVisualContextPath: 'docs/172014/implementation/artifact-review/inputs/visual-context.md'
      }
    });

    expect(command).toBe(
      '/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md,docs/172014/implementation/artifact-review/inputs/visual-context.md,docs/172014/prd/files/menu.png'
    );
    expect(command).not.toContain('docs/172014/prd/files,');
  });

  it('普通需求 OpenSpec 快速生成命令携带技术方案版本上下文路径', () => {
    const command = internalForTests.buildSkillCommand(workflow(), {
      actionType: 'OPENSPEC_FF',
      params: {
        openSpecArtifactContextPath: 'docs/172014/implementation/artifact-review/inputs/context.md'
      }
    });

    expect(command).toBe(
      '/openspec-ff-change req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md,docs/172014/implementation/artifact-review/inputs/context.md'
    );
  });

  it('已有完整 OpenSpec 工件时使用增量修订技能更新工件', () => {
    const item = {
      ...workflow(),
      artifacts: completeOpenSpecArtifacts()
    };

    expect(internalForTests.hasCompleteOpenSpecArtifacts(item)).toBe(true);
    expect(internalForTests.openSpecArtifactSkillName(item)).toBe('coding-openspec-amend');
    expect(internalForTests.buildSkillCommand(item, { actionType: 'OPENSPEC_FF', params: {} })).toBe(
      '/coding-openspec-amend req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md'
    );
  });

  it('归档 OpenSpec 工件不判定为可增量修订', () => {
    const item = {
      ...workflow(),
      artifacts: completeOpenSpecArtifacts([
        {
          label: 'OpenSpec Change（已归档）',
          path: 'openspec/changes/archive/2026-07-14-req-172014'
        }
      ])
    };

    expect(internalForTests.hasCompleteOpenSpecArtifacts(item)).toBe(false);
    expect(internalForTests.openSpecArtifactSkillName(item)).toBe('openspec-ff-change');
  });

  it('执行 OpenSpec 工件动作已有完整工件时 commandText 使用增量修订技能', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-amend-command-'));
    const run = await executeAction(root, { ...workflow(), artifacts: completeOpenSpecArtifacts() }, {
      actionType: 'OPENSPEC_FF',
      params: {
        agentId: 'missing-agent'
      }
    });

    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.commandText).toBe(
      '/coding-openspec-amend req-172014 d=docs/172014/prd/analysis.md,docs/172014/technical-design/design_review.md'
    );
  });

  it('缺陷 OpenSpec 快速生成命令不自动携带 PRD 文档、PRD 文件目录和技术方案附件', () => {
    const item = {
      ...workflow(),
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, { actionType: 'OPENSPEC_FF', params: {} });

    expect(command).toBe('/openspec-ff-change req-172014 d=docs/172014/technical-design/design_review.md');
    expect(command).not.toContain('/prd/');
    expect(command).not.toContain('docs/172014/technical-design/files/source-1.png');
  });

  it('缺陷 OpenSpec 快速生成命令携带技术方案版本上下文但不自动携带附件', () => {
    const item = {
      ...workflow(),
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '配置截图.png',
          path: 'docs/172014/technical-design/files/source-1.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, {
      actionType: 'OPENSPEC_FF',
      params: {
        openSpecArtifactContextPath: 'docs/172014/implementation/artifact-review/inputs/context.md'
      }
    });

    expect(command).toBe(
      '/openspec-ff-change req-172014 d=docs/172014/technical-design/design_review.md,docs/172014/implementation/artifact-review/inputs/context.md'
    );
    expect(command).not.toContain('/prd/');
    expect(command).not.toContain('docs/172014/technical-design/files/source-1.png');
  });

  it('缺陷 OpenSpec 快速生成命令只携带显式视觉上下文和补充文件', () => {
    const item = {
      ...workflow(),
      requirementType: 'DEFECT' as const,
      currentStage: 'TECH_DESIGN' as const,
      stages: createEmptyStages('DEFECT'),
      techDesignSourceFiles: [
        {
          id: 'source-1',
          name: '未选择截图.png',
          path: 'docs/172014/technical-design/files/unselected.png',
          size: 100,
          uploadedAt: new Date().toISOString()
        }
      ]
    };

    const command = internalForTests.buildSkillCommand(item, {
      actionType: 'OPENSPEC_FF',
      params: {
        openSpecVisualContextPath: 'docs/172014/implementation/artifact-review/inputs/visual-context.md',
        visualContextFiles: ['docs/172014/technical-design/files/selected.png'],
        sourceFiles: ['docs/172014/technical-design/files/manual.md']
      }
    });

    expect(command).toBe(
      '/openspec-ff-change req-172014 d=docs/172014/technical-design/design_review.md,docs/172014/implementation/artifact-review/inputs/visual-context.md,docs/172014/technical-design/files/selected.png,docs/172014/technical-design/files/manual.md'
    );
    expect(command).not.toContain('/prd/');
    expect(command).not.toContain('docs/172014/technical-design/files/unselected.png');
  });

  it('首次 OpenSpec 快速生成有补充说明时不生成技术方案版本上下文', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-first-ff-'));
    const designPath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
    await fs.mkdir(path.dirname(designPath), { recursive: true });
    await fs.writeFile(designPath, '# 技术方案\n\n最新方案\n', 'utf8');

    const run = await executeAction(root, workflow(), {
      actionType: 'OPENSPEC_FF',
      params: {
        changeName: 'req-172014',
        documentPath: 'docs/172014/technical-design/design_review.md',
        artifactAdjustment: '首次生成按最新技术方案出完整工件',
        supplementBlocks: [{ id: 'paragraph-1', type: 'PARAGRAPH', text: '首次生成按最新技术方案出完整工件' }],
        agentId: 'missing-agent'
      }
    });

    const supplementPath = String(run.params.supplementInputPath);
    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.openSpecArtifactInputSnapshot).toBeUndefined();
    expect(run.params).not.toHaveProperty('baseTechDesignVersionId');
    expect(run.params).not.toHaveProperty('targetTechDesignVersionId');
    expect(run.params).not.toHaveProperty('openSpecArtifactContextPath');
    expect(supplementPath).toMatch(/^docs\/172014\/implementation\/artifact-review\/inputs\/supplements\/\d{14}-openspec_ff-run-.+\.md$/);
    expect(run.commandText).toContain(supplementPath);
  });

  it('执行 OpenSpec 快速生成时冻结 current 目标版本并记录输入快照', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-input-'));
    const designPath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
    await fs.mkdir(path.dirname(designPath), { recursive: true });
    await fs.writeFile(designPath, '# 技术方案\n\n旧方案\n', 'utf8');
    const base = await createTechDesignDraftSnapshot(root, '172014');
    expect(base).toBeDefined();
    if (!base) {
      throw new Error('未生成技术方案基线快照');
    }
    const baseVersion = base;
    await fs.writeFile(designPath, '# 技术方案\n\n新方案\n', 'utf8');

    const run = await executeAction(root, workflow(), {
      actionType: 'OPENSPEC_FF',
      params: {
        changeName: 'req-172014',
        documentPath: 'docs/172014/technical-design/design_review.md',
        sourceFiles: ['docs/172014/technical-design/files/change-screen.png'],
        baseTechDesignVersionId: baseVersion.id,
        targetTechDesignVersionId: 'current',
        artifactAdjustment: '仅增量更新 tasks',
        supplementBlocks: [
          { id: 'paragraph-1', type: 'PARAGRAPH', text: '仅增量更新 tasks' },
          {
            id: 'image-1',
            type: 'IMAGE',
            fileId: 'file-1',
            name: 'change-screen.png',
            path: 'docs/172014/technical-design/files/change-screen.png',
            size: 1024,
            caption: '工件调整截图'
          }
        ],
        agentId: 'missing-agent'
      }
    });

    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.params.baseTechDesignVersionId).toBe(baseVersion.id);
    expect(String(run.params.targetTechDesignVersionId)).toMatch(/^snapshot:/);
    expect(run.openSpecArtifactInputSnapshot).toEqual(
      expect.objectContaining({
        baseTechDesignVersionId: baseVersion.id,
        adjustment: '仅增量更新 tasks'
      })
    );
    expect(run.openSpecArtifactInputSnapshot?.targetTechDesignVersionId).toMatch(/^snapshot:/);
    const contextPath = String(run.params.openSpecArtifactContextPath);
    expect(contextPath).toMatch(/^docs\/172014\/implementation\/artifact-review\/inputs\/.+-tech-design-version-context\.md$/);
    const supplementPath = String(run.params.supplementInputPath);
    expect(supplementPath).toMatch(/^docs\/172014\/implementation\/artifact-review\/inputs\/supplements\/\d{14}-openspec_ff-run-.+\.md$/);
    expect(run.params.artifactAdjustment).toBe(`补充输入见 ${supplementPath}`);
    expect(run.params.sourceFiles).toEqual(['docs/172014/technical-design/files/change-screen.png']);
    expect(run.commandText).toContain(contextPath);
    expect(run.commandText).not.toContain(supplementPath);
    const contextContent = await fs.readFile(path.join(root, contextPath), 'utf8');
    expect(contextContent).toContain('仅增量更新 tasks');
    expect(contextContent).toContain('新方案');
    const supplementContent = await fs.readFile(path.join(root, supplementPath), 'utf8');
    expect(supplementContent).toContain('动作: OPENSPEC_FF');
    expect(supplementContent).toContain('![工件调整截图](docs/172014/technical-design/files/change-screen.png)');
  });

  it('OpenSpec 快速生成在版本一致但有调整说明时仍生成输入快照', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-same-version-'));
    const designPath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
    await fs.mkdir(path.dirname(designPath), { recursive: true });
    await fs.writeFile(designPath, '# 技术方案\n\n同版调整\n', 'utf8');
    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    expect(snapshot).toBeDefined();
    if (!snapshot) {
      throw new Error('未生成技术方案快照');
    }
    const versionId = snapshot.id;

    const run = await executeAction(root, workflow(), {
      actionType: 'OPENSPEC_FF',
      params: {
        changeName: 'req-172014',
        documentPath: 'docs/172014/technical-design/design_review.md',
        baseTechDesignVersionId: versionId,
        targetTechDesignVersionId: versionId,
        artifactAdjustment: '只更新 proposal 非目标说明',
        agentId: 'missing-agent'
      }
    });

    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.openSpecArtifactInputSnapshot).toEqual(
      expect.objectContaining({
        baseTechDesignVersionId: versionId,
        targetTechDesignVersionId: versionId,
        adjustment: '只更新 proposal 非目标说明'
      })
    );
    const contextContent = await fs.readFile(path.join(root, String(run.params.openSpecArtifactContextPath)), 'utf8');
    expect(contextContent).toContain('两个技术方案版本正文无差异');
    expect(contextContent).toContain('只更新 proposal 非目标说明');
  });

  it('OpenSpec 快速生成在版本一致且无调整说明时阻止运行', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-openspec-same-version-'));
    const designPath = path.join(root, 'docs', '172014', 'technical-design', 'design_review.md');
    await fs.mkdir(path.dirname(designPath), { recursive: true });
    await fs.writeFile(designPath, '# 技术方案\n\n同版调整\n', 'utf8');
    const snapshot = await createTechDesignDraftSnapshot(root, '172014');
    expect(snapshot).toBeDefined();
    if (!snapshot) {
      throw new Error('未生成技术方案快照');
    }
    const versionId = snapshot.id;

    await expect(
      executeAction(root, workflow(), {
        actionType: 'OPENSPEC_FF',
        params: {
          changeName: 'req-172014',
          documentPath: 'docs/172014/technical-design/design_review.md',
          baseTechDesignVersionId: versionId,
          targetTechDesignVersionId: versionId,
          agentId: 'missing-agent'
        }
      })
    ).rejects.toThrow('技术方案基线版本和目标版本一致');
  });

  it('生成 commit 模式代码评审命令并包含需求号、工程范围、分支和外部文档', () => {
    const item = {
      ...workflow(),
      projects: [
        { name: 'opp-api', path: 'opp-api' },
        { name: 'opp-learn', path: 'opp-learn' }
      ]
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'CODE_REVIEW',
        params: {
          docs: 'docs/172014/technical-design/design_review.md'
        }
      })
    ).toBe('/coding-review r=172014 p=opp-api,opp-learn m=commit b=feature/opp-172014 d=docs/172014/technical-design/design_review.md');
  });

  it('生成 staged 模式代码评审命令时不拼接分支参数', () => {
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-learn', path: 'opp-learn' }]
    };

    expect(
      internalForTests.buildSkillCommand(item, {
        actionType: 'CODE_REVIEW',
        params: {
          reviewMode: 'staged',
          branchName: 'feature/ignored'
        }
      })
    ).toBe('/coding-review r=172014 p=opp-learn m=staged');
  });

  it('未维护涉及工程时生成代码评审工程占位符', () => {
    expect(internalForTests.buildSkillCommand(workflow(), { actionType: 'CODE_REVIEW', params: {} })).toBe(
      '/coding-review r=172014 p=<project-list> m=commit b=feature/opp-172014'
    );
  });

  it('staged 模式代码评审在无暂存文件时阻止启动 Agent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const projectRoot = path.join(root, 'opp-learn');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-learn', path: 'opp-learn' }]
    };

    const run = await executeAction(root, item, {
      actionType: 'CODE_REVIEW',
      params: {
        reviewMode: 'staged',
        agentId: 'missing-agent'
      }
    });
    const events = await readRunEvents(root, '172014', run.id);

    expect(run.status).toBe('FAILED');
    expect(run.error).toContain('暂存区没有已暂存文件');
    expect(events.some((event) => event.message.includes('暂存区没有已暂存文件'))).toBe(true);
  });

  it('staged 模式代码评审使用当前用户项目私有工程目录做 Git 预检查', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-review-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-learn');
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await git(projectRoot, ['init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\n', 'utf8');
    await git(projectRoot, ['add', '.']);
    await git(projectRoot, ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init']);
    await fs.writeFile(path.join(projectRoot, 'src', 'a.txt'), 'old\nnew\n', 'utf8');
    await git(projectRoot, ['add', 'src/a.txt']);
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-learn', path: 'opp-learn' }]
    };

    const run = await executeAction(
      root,
      item,
      {
        actionType: 'CODE_REVIEW',
        params: {
          reviewMode: 'staged',
          agentId: 'missing-agent'
        }
      },
      async () => undefined,
      { projectPaths: [projectParent] }
    );

    expect(run.status).toBe('WAITING_FOR_AGENT');
    expect(run.error).toBeUndefined();
    expect(run.commandText).toContain('p=opp-learn');
  });
});

function response(data: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, data })
  };
}

describe('agent-providers', () => {
  it('内置 CLI 执行时实时追加 stdout 和 stderr 事件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-cli-'));
    const events: Array<{ type: string; text?: string }> = [];

    const result = await internalForTests.runCli(
      root,
      [process.execPath, '-e', 'console.log("cli-out"); console.error("cli-err");'],
      async (event) => {
        events.push(event);
      }
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('cli-out'))).toBe(true);
    expect(events.some((event) => event.type === 'STDERR' && event.text?.includes('cli-err'))).toBe(true);
  });

  it('默认提供 codex Provider', async () => {
    const providers = await listAgentProviders();
    expect(providers.map((provider) => provider.id)).toEqual(expect.arrayContaining(['codex']));
    const codex = providers.find((provider) => provider.id === 'codex');
    expect(codex?.inputMode).toBe('STDIN');
    expect(codex?.command).toEqual([
      'codex',
      'exec',
      '--json',
      '--sandbox',
      'workspace-write',
      '-C',
      '{workspaceRoot}',
      '{projectParentAddDirArgs}',
      '{projectAddDirArgs}',
      '-'
    ]);
    expect(codex?.interactiveCommand).toEqual([
      'codex',
      '--sandbox',
      'workspace-write',
      '-C',
      '{workspaceRoot}',
      '{projectParentAddDirArgs}',
      '{projectAddDirArgs}',
      '--no-alt-screen',
      '{prompt}'
    ]);
    expect(codex?.supportsInteractive).toBe(true);
  });

  it('生成 Prompt Envelope 并包含技能调用文本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    await fs.mkdir(path.join(root, '.codex', 'skills', 'coding-prd-analyzer'), { recursive: true });
    await fs.writeFile(path.join(root, '.codex', 'skills', 'coding-prd-analyzer', 'SKILL.md'), 'skill');
    const promptPath = await createPromptEnvelope(root, workflow(), runRecord('run-1'), '/coding-prd-analyzer id=172014');
    const content = await fs.readFile(resolveWorkspaceOrRuntimePath(root, promptPath), 'utf8');
    expect(content).toContain('/coding-prd-analyzer id=172014');
    expect(content).toContain('.codex/skills/coding-prd-analyzer/SKILL.md');
  });

  it('Prompt Envelope 区分交付工作区和工程代码目录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const promptPath = await createPromptEnvelope(root, item, runRecord('run-projects'), '/coding-prd-analyzer id=172014', [projectParent]);
    const content = await fs.readFile(resolveWorkspaceOrRuntimePath(root, promptPath), 'utf8');

    expect(content).toContain(`- 交付工作区: ${root}`);
    expect(content).toContain('## 工程代码目录');
    expect(content).toContain(projectParent);
    expect(content).toContain(projectRoot);
    expect(content).toContain('交付产物、OpenSpec 工件、运行日志和报告必须写入交付工作区');
  });

  it('启动 Agent 后记录 stdout 和退出事件', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'node-agent',
      name: 'Node Agent',
      inputMode: 'PROMPT_FILE',
      command: [process.execPath, '-e', 'console.log("agent-ok")'],
      available: true,
      supportsStreaming: true
    };
    const run = runRecord('run-stdout');
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });
    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    const updated = await updatedPromise;
    const events = await readRunEvents(root, '172014', run.id);
    expect(updated.status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('agent-ok'))).toBe(true);
  });

  it('STDIN 模式向 Agent 传入完整 Prompt Envelope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'node-stdin-agent',
      name: 'Node STDIN Agent',
      inputMode: 'STDIN',
      command: [
        process.execPath,
        '-e',
        'let data = ""; process.stdin.on("data", (chunk) => data += chunk); process.stdin.on("end", () => console.log(data.includes("AI Delivery Agent Task") && data.includes("/coding-prd-analyzer id=172014") ? "stdin-envelope-ok" : data));'
      ],
      available: true,
      supportsStreaming: true
    };
    const run = runRecord('run-stdin');
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });
    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    const updated = await updatedPromise;
    const events = await readRunEvents(root, '172014', run.id);
    expect(updated.status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'STDOUT' && event.text?.includes('stdin-envelope-ok'))).toBe(true);
  });

  it('终端模式下 Codex STDIN 命令改为 prompt 参数以保留终端交互', () => {
    const provider: AgentProvider = {
      id: 'codex',
      name: 'Codex',
      inputMode: 'STDIN',
      command: ['codex', 'exec', '-C', '{workspaceRoot}', '-'],
      available: true,
      supportsStreaming: true
    };

    expect(terminalCommandLine(provider, ['codex', 'exec', '-C', '/workspace', '-'])).toBe(
      "'codex' 'exec' '-C' '/workspace' \"$(cat \"$PROMPT_FILE\")\""
    );
  });

  it('交互终端命令按参数数组安全转义', () => {
    expect(interactiveTerminalCommandLine(['codex', '-C', '/workspace', "hello 'user'"])).toBe("'codex' '-C' '/workspace' 'hello '\\''user'\\'''");
  });

  it('生成本地终端脚本并记录 transcript 和状态路径', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const provider: AgentProvider = {
      id: 'node-agent',
      name: 'Node Agent',
      inputMode: 'PROMPT_FILE',
      command: [process.execPath, '-e', 'console.log("terminal-ok")'],
      available: true,
      supportsStreaming: true
    };
    const run = {
      ...runRecord('run-terminal-script'),
      executionMode: 'TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014');
    const script = await fs.readFile(resolveWorkspaceOrRuntimePath(root, terminal.scriptPath), 'utf8');

    expect(terminal.scriptPath).toBe('.ai-delivery-runtime/requirements/172014/scripts/run-terminal-script.command');
    expect(terminal.transcriptPath).toBe('.ai-delivery-runtime/requirements/172014/runs/run-terminal-script.terminal.log');
    expect(terminal.statusPath).toBe('.ai-delivery-runtime/requirements/172014/runs/run-terminal-script.terminal-status.json');
    expect(script).toContain('AI Delivery');
    expect(script).toContain('/coding-prd-analyzer id=172014');
    expect(script).toContain('terminal-status.json');
  });

  it('生成交互终端脚本时使用 interactiveCommand 模板', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const provider: AgentProvider = {
      id: 'interactive-agent',
      name: 'Interactive Agent',
      inputMode: 'PROMPT_FILE',
      command: ['background-agent'],
      interactiveCommand: ['interactive-agent', '--workspace', '{workspaceRoot}', '--prompt', '{prompt}'],
      available: true,
      supportsStreaming: true,
      supportsInteractive: true
    };
    const run = {
      ...runRecord('run-interactive-script'),
      executionMode: 'INTERACTIVE_TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, workflow(), run, provider, '/coding-prd-analyzer id=172014');
    const script = await fs.readFile(resolveWorkspaceOrRuntimePath(root, terminal.scriptPath), 'utf8');

    expect(terminal.commandLine).toContain("'interactive-agent'");
    expect(terminal.commandLine).not.toContain('background-agent');
    expect(script).toContain("EXECUTION_MODE='INTERACTIVE_TERMINAL'");
    expect(script).toContain("EXECUTION_MODE_LABEL='交互终端'");
    expect(script).toContain('script -q -a "$TRANSCRIPT_FILE" zsh -lc "setopt pipefail; $COMMAND_PREVIEW"');
  });

  it('CodeBuddy 终端命令将涉及工程追加为 add-dir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const projectParent = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-projects-'));
    const projectRoot = path.join(projectParent, 'opp-api');
    await fs.mkdir(projectRoot, { recursive: true });
    const provider: AgentProvider = {
      id: 'codebuddy',
      name: 'CodeBuddy',
      inputMode: 'STDIN',
      command: ['codebuddy', '--add-dir', '{workspaceRoot}', '{projectAddDirArgs}', '-'],
      available: true,
      supportsStreaming: false
    };
    const item = {
      ...workflow(),
      projects: [{ name: 'opp-api', path: 'opp-api' }]
    };
    const run = {
      ...runRecord('run-codebuddy-script'),
      agentId: 'codebuddy',
      executionMode: 'TERMINAL' as const
    };

    const terminal = await createTerminalRunScript(root, item, run, provider, '/coding-prd-analyzer id=172014', [projectParent]);

    expect(terminal.commandLine).toContain(`'--add-dir' '${root}' '--add-dir' '${projectRoot}'`);
    expect(terminal.commandLine).toContain('"$(cat "$PROMPT_FILE")"');
  });

  it('刷新本地终端状态文件并更新运行记录', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const item = workflow();
    const run: RunRecord = {
      ...runRecord('run-terminal-finished'),
      status: 'TERMINAL_OPENED',
      executionMode: 'TERMINAL',
      terminalStatusPath: '.ai-delivery-runtime/requirements/172014/runs/run-terminal-finished.terminal-status.json',
      terminalTranscriptPath: '.ai-delivery-runtime/requirements/172014/runs/run-terminal-finished.terminal.log'
    };
    item.runs.push(run);
    await fs.mkdir(path.dirname(resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath)), { recursive: true });
    await fs.writeFile(
      resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath),
      JSON.stringify({
        status: 'SUCCEEDED',
        exitCode: 0,
        finishedAt: '2026-05-22T00:00:00.000Z',
        transcriptPath: run.terminalTranscriptPath
      })
    );

    const refreshed = await refreshTerminalRunStatuses(root, item);
    const events = await readRunEvents(root, '172014', run.id);

    expect(refreshed.changed).toBe(true);
    expect(refreshed.workflow.runs[0].status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'EXIT' && event.message.includes('终端 Agent'))).toBe(true);
  });

  it('刷新交互终端状态文件并保留交互终端语义', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-'));
    const item = workflow();
    const run: RunRecord = {
      ...runRecord('run-interactive-finished'),
      status: 'TERMINAL_OPENED',
      executionMode: 'INTERACTIVE_TERMINAL',
      terminalStatusPath: '.ai-delivery-runtime/requirements/172014/runs/run-interactive-finished.terminal-status.json',
      terminalTranscriptPath: '.ai-delivery-runtime/requirements/172014/runs/run-interactive-finished.terminal.log'
    };
    item.runs.push(run);
    await fs.mkdir(path.dirname(resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath)), { recursive: true });
    await fs.writeFile(
      resolveWorkspaceOrRuntimePath(root, run.terminalStatusPath),
      JSON.stringify({
        status: 'SUCCEEDED',
        exitCode: 0,
        finishedAt: '2026-05-22T00:00:00.000Z',
        transcriptPath: run.terminalTranscriptPath
      })
    );

    const refreshed = await refreshTerminalRunStatuses(root, item);
    const events = await readRunEvents(root, '172014', run.id);

    expect(refreshed.changed).toBe(true);
    expect(refreshed.workflow.runs[0].executionMode).toBe('INTERACTIVE_TERMINAL');
    expect(refreshed.workflow.runs[0].status).toBe('SUCCEEDED');
    expect(events.some((event) => event.type === 'EXIT' && event.message.includes('交互终端 Agent'))).toBe(true);
  });

  it('交互终端已更新技术方案产物但未写成功状态时自动补偿完成', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-terminal-artifact-'));
    const item = {
      ...workflow(),
      techDesignDocument: 'docs/172014/technical-design/design_review.md'
    };
    const run: RunRecord = {
      ...runRecord('run-interactive-artifact-finished'),
      actionType: 'DESIGN_GENERATE',
      stage: 'TECH_DESIGN',
      status: 'TERMINAL_OPENED',
      startedAt: '2026-05-22T00:00:00.000Z',
      executionMode: 'INTERACTIVE_TERMINAL',
      terminalStatusPath: '.ai-delivery-runtime/requirements/172014/runs/run-interactive-artifact-finished.terminal-status.json',
      terminalTranscriptPath: '.ai-delivery-runtime/requirements/172014/runs/run-interactive-artifact-finished.terminal.log'
    };
    item.runs.push(run);
    const designPath = path.join(root, item.techDesignDocument);
    await fs.mkdir(path.dirname(designPath), { recursive: true });
    await fs.writeFile(designPath, '# 技术方案\n\n交互终端已更新产物。', 'utf8');
    await fs.utimes(designPath, new Date('2026-05-22T00:00:05.000Z'), new Date('2026-05-22T00:00:05.000Z'));

    const refreshed = await refreshTerminalRunStatuses(root, item);
    const events = await readRunEvents(root, '172014', run.id);

    expect(refreshed.changed).toBe(true);
    expect(refreshed.workflow.runs[0].status).toBe('COMPLETED');
    expect(events.some((event) => event.type === 'EXIT' && event.message.includes('自动完成运行并执行后处理'))).toBe(true);
  });

  it('可以取消正在运行的 Agent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-agent-'));
    const provider: AgentProvider = {
      id: 'node-agent',
      name: 'Node Agent',
      inputMode: 'PROMPT_FILE',
      command: [process.execPath, '-e', 'setTimeout(() => {}, 10000)'],
      available: true,
      supportsStreaming: true
    };
    const run = runRecord('run-cancel');
    let resolveUpdate!: (run: RunRecord) => void;
    const updatedPromise = new Promise<RunRecord>((resolve) => {
      resolveUpdate = resolve;
    });
    await startAgentProcess(root, workflow(), run, provider, '/coding-prd-analyzer id=172014', async (nextRun) => resolveUpdate(nextRun));
    await cancelAgentRun(root, '172014', run.id);
    const updated = await updatedPromise;
    expect(updated.status).toBe('CANCELLED');
  });
});
