import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyImplementationRun,
  applyPrdClarificationRun,
  captureTechDesignInputSnapshot,
  consumeTechDesignInputsAfterRun,
  createRouter,
  finalizeSuccessfulTechDesignMemoryFeedback,
  finalizeSuccessfulTechDesignRuns
} from '../../server/router';
import {
  createTechDesignAnnotation,
  listTechDesignAnnotations,
  techDesignAnnotationSummaryPath
} from '../../server/services/tech-design-annotations';
import { readTechDesignInputLedger, techDesignInputLedgerPath } from '../../server/services/tech-design-input-ledger';
import { WorkflowRepository } from '../../server/services/workflow-repository';
import { MemoryRepository } from '../../server/services/memory-repository';
import type { RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyImplementationSteps, createEmptyStages } from '../../shared/workflow';

async function tmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function request(headers: IncomingMessage['headers']): IncomingMessage {
  const stream = new Readable({
    read() {
      this.push(null);
    }
  }) as IncomingMessage;
  stream.method = 'GET';
  stream.url = '/api/ai-delivery/requirements/141846';
  stream.headers = headers;
  return stream;
}

function requestWithBody(method: string, url: string, headers: IncomingMessage['headers'], body: Buffer): IncomingMessage {
  const stream = Readable.from([body]) as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function response(): { response: ServerResponse; done: Promise<{ status: number; body: any }> } {
  let status = 0;
  let resolveDone!: (value: { status: number; body: any }) => void;
  const done = new Promise<{ status: number; body: any }>((resolve) => {
    resolveDone = resolve;
  });
  const responseMock = {
    writeHead(nextStatus: number) {
      status = nextStatus;
    },
    end(rawBody: string) {
      resolveDone({
        status,
        body: rawBody ? JSON.parse(rawBody) : undefined
      });
    }
  } as unknown as ServerResponse;
  return { response: responseMock, done };
}

function centerResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data })
  } as Response;
}

async function prepareTechDesign(root: string): Promise<void> {
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

function techDesignConsumptionWorkflow(): RequirementWorkflow {
  const now = new Date().toISOString();
  const stages = createEmptyStages();
  return {
    requirementId: '172014',
    title: '定位菜单',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
    stages,
    artifacts: [
      {
        id: 'technical-design',
        stage: 'TECH_DESIGN',
        label: '技术方案',
        path: 'docs/172014/technical-design/design_review.md',
        kind: 'markdown',
        exists: true
      },
      {
        id: 'technical-design-annotations',
        stage: 'TECH_DESIGN',
        label: '技术方案批注记录',
        path: 'docs/172014/technical-design/annotations/comments.md',
        kind: 'markdown',
        exists: true
      },
      {
        id: 'technical-design-question-old',
        stage: 'TECH_DESIGN',
        label: '已消费答疑',
        path: 'docs/172014/technical-design/questions/20260604-173000-question.md',
        kind: 'markdown',
        exists: true
      },
      {
        id: 'technical-design-question-new',
        stage: 'TECH_DESIGN',
        label: '新增答疑',
        path: 'docs/172014/technical-design/questions/20260605-101500-question.md',
        kind: 'markdown',
        exists: true
      }
    ],
    techDesignConsumedQuestionPaths: ['docs/172014/technical-design/questions/20260604-173000-question.md'],
    techDesignSourceFiles: [
      {
        id: 'file-1',
        name: '补充材料.md',
        path: 'docs/172014/technical-design/file/file-1.md',
        size: 100,
        uploadedAt: now
      }
    ],
    techDesignClarification: '补充异常场景',
    runs: [],
    reviews: [],
    issues: []
  };
}

function designGenerateRun(status: RunRecord['status']): RunRecord {
  const now = new Date().toISOString();
  return {
    id: `run-design-${status.toLowerCase()}`,
    requirementId: '172014',
    actionType: 'DESIGN_GENERATE',
    stage: 'TECH_DESIGN',
    status,
    startedAt: now,
    finishedAt: now,
    params: {
      clarification: '补充异常场景',
      sourceFiles: [
        'docs/172014/technical-design/questions/20260604-173000-question.md',
        'docs/172014/technical-design/questions/20260605-101500-question.md',
        'docs/172014/technical-design/file/file-1.md'
      ]
    }
  };
}

describe('router requirement detail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('编辑需求时同时保存中心工程名称和本地工程路径', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-requirement-edit-');
    const projectParent = await tmpDir('ai-delivery-projects-');
    const oppApiPath = path.join(projectParent, 'opp-api');
    const oppLearnPath = path.join(projectParent, 'opp-learn');
    await fs.mkdir(oppApiPath, { recursive: true });
    await fs.mkdir(oppLearnPath, { recursive: true });
    const centerBodies: unknown[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/ai-delivery/projects/5/workspace-mappings') {
        return centerResponse([{ localPath: projectParent, status: 'ACTIVE' }]);
      }
      if (url.pathname === '/api/ai-delivery/requirements' && init?.method === 'POST') {
        centerBodies.push(JSON.parse(String(init.body)));
        return centerResponse({
          id: 100,
          projectId: 5,
          requirementId: '172014',
          title: '更新需求',
          requirementType: 'REQUIREMENT',
          branchName: 'feature/opp#172014',
          status: 'DRAFT',
          currentStage: 'PRD',
          stages: [],
          projectNames: ['opp-api', 'opp-learn']
        });
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, message: 'not found' })
      } as Response;
    });
    vi.stubGlobal('fetch', fetchImpl);

    const router = createRouter(workspaceRoot);
    const result = response();
    await router(
      requestWithBody(
        'POST',
        '/api/ai-delivery/requirements',
        {
          'content-type': 'application/json',
          'x-user-id': '1',
          'x-project-id': '5',
          'x-center-base-url': 'http://center.local'
        },
        Buffer.from(JSON.stringify({
          requirementId: '172014',
          title: '更新需求',
          requirementType: 'REQUIREMENT',
          branchName: 'feature/opp#172014',
          projects: [
            { name: 'opp-api', path: oppApiPath },
            { name: 'opp-learn', path: oppLearnPath }
          ]
        }))
      ),
      result.response
    );
    const { status, body } = await result.done;
    const saved = await new WorkflowRepository(workspaceRoot).load('172014');

    expect(status).toBe(200);
    expect(centerBodies).toEqual([{
      projectId: 5,
      requirementId: '172014',
      title: '更新需求',
      requirementType: 'REQUIREMENT',
      branchName: 'feature/opp#172014',
      projectNames: ['opp-api', 'opp-learn']
    }]);
    expect(body.data.id).toBe(100);
    expect(body.data.projects).toEqual([
      { name: 'opp-api', path: oppApiPath },
      { name: 'opp-learn', path: oppLearnPath }
    ]);
    expect(saved?.projects).toEqual(body.data.projects);
  });

  it('中心存在需求但本地没有 runtime state 时仍允许进入详情读路径', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-router-workspace-');
    const deliveryRoot = await tmpDir('ai-delivery-router-delivery-');
    await fs.mkdir(path.join(deliveryRoot, 'opp-artifacts'), { recursive: true });

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/ai-delivery/projects/5/delivery-workspace') {
        return centerResponse({
          id: 1,
          projectId: 5,
          localPath: deliveryRoot,
          status: 'ACTIVE'
        });
      }
      if (url.pathname === '/api/ai-delivery/projects/my') {
        return centerResponse([
          {
            id: 5,
            name: 'OPP',
            code: 'opp',
            repository: {
              id: 10,
              projectId: 5,
              provider: 'GITLAB',
              repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
              defaultBranch: 'master',
              repoCode: 'opp-artifacts',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (url.pathname === '/api/ai-delivery/requirements/141846') {
        return centerResponse({
          id: 141846,
          projectId: 5,
          requirementId: '141846',
          title: '门店定位菜单优化',
          requirementType: 'REQUIREMENT',
          status: 'DRAFT',
          currentStage: 'PRD'
        });
      }
      if (url.pathname === '/api/ai-delivery/requirements/141846/workspace-states/report') {
        return centerResponse({
          projectId: 5,
          requirementPk: 141846,
          clientSessionId: 99,
          status: 'CLEAN',
          dirtyFileCount: 0,
          dirtyPathsSample: []
        });
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, message: 'not found' })
      } as Response;
    });
    vi.stubGlobal('fetch', fetchImpl);

    const router = createRouter(workspaceRoot);
    const result = response();
    await router(
      request({
        'x-user-id': '1',
        'x-project-id': '5',
        'x-client-session-id': '99',
        'x-center-base-url': 'http://center.local'
      }),
      result.response
    );
    const { status, body } = await result.done;

    expect(status).toBe(200);
    expect(body.data.requirementId).toBe('141846');
    expect(body.data.title).toBe('门店定位菜单优化');
    expect(body.data.artifacts).toEqual([]);
  });

  it('上传技术方案补充材料只做协作占用校验，不上报仓库状态', async () => {
    const requirementId = '141847';
    const workspaceRoot = await tmpDir('ai-delivery-router-workspace-');
    const deliveryRoot = await tmpDir('ai-delivery-router-delivery-');
    const calledPaths: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calledPaths.push(url.pathname);
      if (url.pathname === '/api/ai-delivery/projects/5/delivery-workspace') {
        return centerResponse({
          id: 1,
          projectId: 5,
          localPath: deliveryRoot,
          status: 'ACTIVE'
        });
      }
      if (url.pathname === '/api/ai-delivery/projects/my') {
        return centerResponse([
          {
            id: 5,
            name: 'OPP',
            code: 'opp',
            repository: {
              id: 10,
              projectId: 5,
              provider: 'GITLAB',
              repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
              defaultBranch: 'main',
              repoCode: 'opp-artifacts',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (url.pathname === `/api/ai-delivery/requirements/${requirementId}`) {
        return centerResponse({
          id: Number(requirementId),
          projectId: 5,
          requirementId,
          title: '门店定位菜单优化',
          requirementType: 'REQUIREMENT',
          status: 'DRAFT',
          currentStage: 'TECH_DESIGN'
        });
      }
      if (url.pathname === `/api/ai-delivery/requirements/${requirementId}/workspace-states/assert-writable`) {
        return centerResponse([]);
      }
      if (/\/api\/ai-delivery\/requirements\/[^/]+\/workspace-states\/report$/.test(url.pathname)) {
        return centerResponse({
          projectId: 5,
          requirementPk: Number(url.pathname.match(/requirements\/([^/]+)/)?.[1] || 0),
          clientSessionId: 99,
          status: 'CLEAN',
          dirtyFileCount: 0,
          dirtyPathsSample: []
        });
      }
      if (url.pathname === '/api/ai-delivery/projects/5/repository-state') {
        return centerResponse({
          projectId: 5,
          clientSessionId: 99,
          localRepoPath: path.join(deliveryRoot, 'opp-artifacts'),
          syncStatus: 'READY'
        });
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, message: `not found: ${url.pathname}` })
      } as Response;
    });
    vi.stubGlobal('fetch', fetchImpl);

    const boundary = '----ai-delivery-test-boundary';
    const body = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="files"; filename="补充说明.md"',
        'Content-Type: text/markdown',
        '',
        '# design',
        `--${boundary}--`,
        ''
      ].join('\r\n')
    );
    const router = createRouter(workspaceRoot);
    const result = response();
    await router(
      requestWithBody(
        'POST',
        `/api/ai-delivery/requirements/${requirementId}/tech-design-files`,
        {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'x-user-id': '1',
          'x-project-id': '5',
          'x-client-session-id': '99',
          'x-center-base-url': 'http://center.local'
        },
        body
      ),
      result.response
    );
    const { status, body: responseBody } = await result.done;

    expect(status).toBe(200);
    expect(responseBody.data.techDesignSourceFiles).toHaveLength(1);
    expect(calledPaths).toContain(`/api/ai-delivery/requirements/${requirementId}/workspace-states/assert-writable`);
    expect(calledPaths).not.toContain(`/api/ai-delivery/requirements/${requirementId}/workspace-states/report`);
  });

  it('切换 OpenSpec 任务状态只做轻量写入，不触发 Git 仓库状态上报', async () => {
    const requirementId = '141849';
    const workspaceRoot = await tmpDir('ai-delivery-router-workspace-');
    const deliveryRoot = await tmpDir('ai-delivery-router-delivery-');
    const repoPath = path.join(deliveryRoot, 'opp-artifacts');
    const changeName = `req-${requirementId}`;
    await fs.mkdir(path.join(repoPath, 'openspec', 'changes', changeName, 'specs'), { recursive: true });
    const tasksPath = path.join(repoPath, 'openspec', 'changes', changeName, 'tasks.md');
    await fs.writeFile(path.join(repoPath, 'openspec', 'changes', changeName, 'proposal.md'), '# Proposal\n', 'utf8');
    await fs.writeFile(path.join(repoPath, 'openspec', 'changes', changeName, 'design.md'), '# Design\n', 'utf8');
    await fs.writeFile(tasksPath, '## 开发\n\n- [ ] 1.1 待确认\n', 'utf8');
    const stages = createEmptyStages();
    stages.IMPLEMENTATION.changeName = changeName;
    await new WorkflowRepository(repoPath).save({
      id: Number(requirementId),
      requirementId,
      title: '门店定位菜单优化',
      sources: [],
      currentStage: 'IMPLEMENTATION',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages,
      artifacts: [],
      runs: [],
      reviews: [],
      issues: []
    });

    const calledPaths: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calledPaths.push(url.pathname);
      if (url.pathname === '/api/ai-delivery/projects/5/delivery-workspace') {
        return centerResponse({
          id: 1,
          projectId: 5,
          localPath: deliveryRoot,
          status: 'ACTIVE'
        });
      }
      if (url.pathname === '/api/ai-delivery/projects/my') {
        return centerResponse([
          {
            id: 5,
            name: 'OPP',
            code: 'opp',
            repository: {
              id: 10,
              projectId: 5,
              provider: 'GITLAB',
              repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
              defaultBranch: 'main',
              repoCode: 'opp-artifacts',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (url.pathname === `/api/ai-delivery/requirements/${requirementId}/workspace-states/assert-writable`) {
        return centerResponse([]);
      }
      if (/\/api\/ai-delivery\/requirements\/[^/]+\/workspace-states\/report$/.test(url.pathname)) {
        return centerResponse({});
      }
      if (url.pathname === '/api/ai-delivery/projects/5/repository-state') {
        return centerResponse({});
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, message: `not found: ${url.pathname}` })
      } as Response;
    });
    vi.stubGlobal('fetch', fetchImpl);

    const router = createRouter(workspaceRoot);
    const result = response();
    await router(
      requestWithBody(
        'POST',
        `/api/ai-delivery/requirements/${requirementId}/openspec-tasks`,
        {
          'content-type': 'application/json',
          'x-user-id': '1',
          'x-project-id': '5',
          'x-client-session-id': '99',
          'x-center-base-url': 'http://center.local'
        },
        Buffer.from(JSON.stringify({ changeName, line: 3, completed: true, raw: '1.1 待确认' }))
      ),
      result.response
    );
    const { status, body } = await result.done;
    const tasksContent = await fs.readFile(tasksPath, 'utf8');

    expect(status).toBe(200);
    expect(body.data.tasks.completed).toBe(1);
    expect(tasksContent).toContain('- [x] 1.1 待确认');
    expect(calledPaths).toContain(`/api/ai-delivery/requirements/${requirementId}/workspace-states/assert-writable`);
    expect(calledPaths).not.toContain(`/api/ai-delivery/requirements/${requirementId}/workspace-states/report`);
    expect(calledPaths).not.toContain('/api/ai-delivery/projects/5/repository-state');
    expect(calledPaths).not.toContain('/api/ai-delivery/users/me/git-credentials');
  });

  it('流程动作遇到旧中心缺少协作占用接口时降级执行', async () => {
    const requirementId = '141848';
    const workspaceRoot = await tmpDir('ai-delivery-router-workspace-');
    const deliveryRoot = await tmpDir('ai-delivery-router-delivery-');
    await fs.mkdir(path.join(deliveryRoot, 'opp-artifacts'), { recursive: true });
    const calledPaths: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calledPaths.push(url.pathname);
      if (url.pathname === '/api/ai-delivery/projects/5/delivery-workspace') {
        return centerResponse({
          id: 1,
          projectId: 5,
          localPath: deliveryRoot,
          status: 'ACTIVE'
        });
      }
      if (url.pathname === '/api/ai-delivery/projects/my') {
        return centerResponse([
          {
            id: 5,
            name: 'OPP',
            code: 'opp',
            repository: {
              id: 10,
              projectId: 5,
              provider: 'GITLAB',
              repoUrl: 'git@git.example.com:opp/ai-delivery-artifacts.git',
              defaultBranch: 'main',
              repoCode: 'opp-artifacts',
              status: 'ACTIVE'
            }
          }
        ]);
      }
      if (url.pathname === `/api/ai-delivery/requirements/${requirementId}`) {
        return centerResponse({
          id: Number(requirementId),
          projectId: 5,
          requirementId,
          title: '门店定位菜单优化',
          requirementType: 'REQUIREMENT',
          status: 'DRAFT',
          currentStage: 'PRD'
        });
      }
      if (url.pathname === `/api/ai-delivery/requirements/${requirementId}/workspace-states/assert-writable`) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: 'not found' })
        } as Response;
      }
      return centerResponse({});
    });
    vi.stubGlobal('fetch', fetchImpl);

    const router = createRouter(workspaceRoot);
    const result = response();
    await router(
      requestWithBody(
        'POST',
        `/api/ai-delivery/requirements/${requirementId}/actions`,
        {
          'content-type': 'application/json',
          'x-user-id': '1',
          'x-project-id': '5',
          'x-client-session-id': '99',
          'x-center-base-url': 'http://center.local'
        },
        Buffer.from(JSON.stringify({ actionType: 'REFRESH_ARTIFACTS' }))
      ),
      result.response
    );
    const { status, body } = await result.done;

    expect(status).toBe(200);
    expect(body.data.run.status).toBe('SUCCEEDED');
    expect(calledPaths).toContain(`/api/ai-delivery/requirements/${requirementId}/workspace-states/assert-writable`);
  });

  it('PRD 澄清成功后回到待审核并保留下游产物', () => {
    const now = new Date().toISOString();
    const stages = createEmptyStages();
    stages.PRD.status = 'APPROVED';
    stages.PRD.artifactPath = 'docs/172014/prd/analysis.md';
    stages.TECH_DESIGN.status = 'APPROVED';
    stages.TECH_DESIGN.artifactPath = 'docs/172014/technical-design/design_review.md';
    const workflow: RequirementWorkflow = {
      requirementId: '172014',
      title: '定位菜单',
      sources: [],
      currentStage: 'TECH_DESIGN',
      status: 'IN_PROGRESS',
      createdAt: now,
      updatedAt: now,
      stages,
      artifacts: [
        {
          id: 'prd-analysis',
          stage: 'PRD',
          label: 'PRD 分析文档',
          path: 'docs/172014/prd/analysis.md',
          kind: 'markdown',
          exists: true
        },
        {
          id: 'technical-design',
          stage: 'TECH_DESIGN',
          label: '技术方案',
          path: 'docs/172014/technical-design/design_review.md',
          kind: 'markdown',
          exists: true
        }
      ],
      runs: [],
      reviews: [],
      issues: []
    };
    const run: RunRecord = {
      id: 'run-prd-clarify',
      requirementId: '172014',
      actionType: 'PRD_CLARIFY',
      stage: 'PRD',
      status: 'SUCCEEDED',
      startedAt: now,
      finishedAt: now,
      params: { description: '补充异常场景' }
    };

    const updated = applyPrdClarificationRun(workflow, run);

    expect(updated.currentStage).toBe('PRD');
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.stages.PRD.status).toBe('READY_FOR_REVIEW');
    expect(updated.stages.PRD.runId).toBe('run-prd-clarify');
    expect(updated.stages.TECH_DESIGN.status).toBe('APPROVED');
    expect(updated.artifacts.map((artifact) => artifact.path)).toContain('docs/172014/technical-design/design_review.md');
  });

  it('OpenSpec 工件重新生成成功后回退工件评审和下游实施步骤', () => {
    const now = new Date().toISOString();
    const stages = createEmptyStages();
    stages.PRD.status = 'APPROVED';
    stages.TECH_DESIGN.status = 'APPROVED';
    stages.IMPLEMENTATION.status = 'APPROVED';
    const implementationSteps = createEmptyImplementationSteps();
    implementationSteps.START_CHANGE.status = 'APPROVED';
    implementationSteps.ARTIFACT_REVIEW.status = 'APPROVED';
    implementationSteps.APPLY.status = 'APPROVED';
    implementationSteps.CHANGE_INSPECTION.status = 'APPROVED';
    const workflow: RequirementWorkflow = {
      requirementId: '172014',
      title: '定位菜单',
      sources: [],
      currentStage: 'IMPLEMENTATION',
      status: 'IN_PROGRESS',
      createdAt: now,
      updatedAt: now,
      stages,
      implementationSteps,
      artifacts: [],
      runs: [],
      reviews: [],
      issues: []
    };
    const run: RunRecord = {
      id: 'run-openspec-ff',
      requirementId: '172014',
      actionType: 'OPENSPEC_FF',
      stage: 'IMPLEMENTATION',
      implementationStep: 'ARTIFACT_REVIEW',
      status: 'SUCCEEDED',
      startedAt: now,
      finishedAt: now,
      params: {},
      openSpecArtifactInputSnapshot: {
        baseTechDesignVersionId: 'snapshot:base',
        targetTechDesignVersionId: 'snapshot:target',
        contextPath: 'docs/172014/implementation/artifact-review/inputs/context.md',
        capturedAt: now
      }
    };

    const updated = applyImplementationRun(workflow, run);

    expect(updated.stages.IMPLEMENTATION.status).toBe('IN_PROGRESS');
    expect(updated.implementationSteps?.START_CHANGE?.status).toBe('APPROVED');
    expect(updated.implementationSteps?.ARTIFACT_REVIEW?.status).toBe('READY_FOR_REVIEW');
    expect(updated.implementationSteps?.APPLY?.status).toBe('DRAFT');
    expect(updated.implementationSteps?.CHANGE_INSPECTION?.status).toBe('NOT_STARTED');
    expect(updated.implementationSteps?.APPLY?.comment).toContain('重新审核后继续实施');
    expect(updated.implementationSteps?.CHANGE_INSPECTION?.comment).toContain('重新审核后继续实施');
  });

  it('技术方案生成成功后消费增量输入并清空当前补充材料和说明', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-tech-design-consume-');
    await prepareTechDesign(workspaceRoot);
    await createTechDesignAnnotation(workspaceRoot, '172014', annotationInput());
    const workflow = techDesignConsumptionWorkflow();

    const updated = await consumeTechDesignInputsAfterRun(workspaceRoot, workflow, designGenerateRun('SUCCEEDED'));
    const annotations = await listTechDesignAnnotations(workspaceRoot, '172014');
    const ledger = await readTechDesignInputLedger(workspaceRoot, '172014');
    const rawLedger = await fs.readFile(path.join(workspaceRoot, techDesignInputLedgerPath('172014')), 'utf8');

    expect(updated.techDesignClarification).toBe('');
    expect(updated.techDesignSourceFiles).toEqual([]);
    expect(updated.techDesignConsumedQuestionPaths).toEqual([
      'docs/172014/technical-design/questions/20260604-173000-question.md',
      'docs/172014/technical-design/questions/20260605-101500-question.md'
    ]);
    expect(ledger.entries.map((entry) => entry.type)).toEqual(expect.arrayContaining(['QUESTION', 'SOURCE_FILE', 'CLARIFICATION']));
    expect(rawLedger).toContain('docs/172014/technical-design/questions/20260605-101500-question.md');
    expect(annotations.annotations[0].status).toBe('RESOLVED');
    expect(annotations.annotations[0].includeInNextGeneration).toBe(false);
    expect(annotations.annotations[0].consumedRunId).toBe('run-design-succeeded');
    await expect(fs.readFile(path.join(workspaceRoot, techDesignAnnotationSummaryPath('172014')), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('成功运行只消费启动时冻结的输入且重复后处理保持幂等', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-tech-design-snapshot-consume-');
    await prepareTechDesign(workspaceRoot);
    const annotationList = await createTechDesignAnnotation(workspaceRoot, '172014', annotationInput());
    const workflow = techDesignConsumptionWorkflow();
    const snapshot = captureTechDesignInputSnapshot(
      workflow,
      {
        clarification: '补充异常场景',
        sourceFiles: [
          'docs/172014/technical-design/questions/20260605-101500-question.md',
          'docs/172014/technical-design/file/file-1.md',
          '/tmp/tech-design-annotations-runtime.md'
        ]
      },
      [annotationList.annotations[0].id],
      ['/tmp/tech-design-annotations-runtime.md']
    );
    workflow.techDesignSourceFiles?.push({
      id: 'file-2',
      name: '运行期间新增.md',
      path: 'docs/172014/technical-design/file/file-2.md',
      size: 200,
      uploadedAt: new Date().toISOString()
    });
    workflow.techDesignClarification = '运行期间新增说明';
    const run = {
      ...designGenerateRun('SUCCEEDED'),
      techDesignInputSnapshot: snapshot
    };
    workflow.runs = [run];

    const first = await finalizeSuccessfulTechDesignRuns(workspaceRoot, workflow);
    const firstLedger = await readTechDesignInputLedger(workspaceRoot, '172014');
    const second = await finalizeSuccessfulTechDesignRuns(workspaceRoot, first.workflow);
    const secondLedger = await readTechDesignInputLedger(workspaceRoot, '172014');

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(run.techDesignInputsConsumedAt).toBeTruthy();
    expect(first.workflow.techDesignClarification).toBe('运行期间新增说明');
    expect(first.workflow.techDesignSourceFiles?.map((file) => file.path)).toEqual([
      'docs/172014/technical-design/file/file-2.md'
    ]);
    expect(first.workflow.techDesignConsumedQuestionPaths).toEqual([
      'docs/172014/technical-design/questions/20260604-173000-question.md',
      'docs/172014/technical-design/questions/20260605-101500-question.md'
    ]);
    expect(firstLedger.entries).toHaveLength(secondLedger.entries.length);
    expect(firstLedger.entries.filter((entry) => entry.type === 'QUESTION').map((entry) => entry.path)).toEqual([
      'docs/172014/technical-design/questions/20260605-101500-question.md'
    ]);
  });

  it('交互终端成功刷新后不再在技术方案阶段补跑项目记忆候选提炼', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-tech-design-memory-feedback-');
    await prepareTechDesign(workspaceRoot);
    const workflow = techDesignConsumptionWorkflow();
    const snapshot = captureTechDesignInputSnapshot(workflow, {
      clarification: '装修的需求内管在 opp-admin-news-vue，生成方案时需要参考该工程'
    });
    const run = {
      ...designGenerateRun('SUCCEEDED'),
      techDesignInputSnapshot: snapshot
    };
    workflow.runs = [run];

    const finalized = await finalizeSuccessfulTechDesignRuns(workspaceRoot, workflow);
    await finalizeSuccessfulTechDesignMemoryFeedback(workspaceRoot, finalized.workflow, { projectId: '10' });
    await finalizeSuccessfulTechDesignMemoryFeedback(workspaceRoot, finalized.workflow, { projectId: '10' });

    const repository = new MemoryRepository(workspaceRoot);
    const candidates = await repository.listCandidates({ projectId: '10', requirementId: '172014' });

    expect(candidates.items).toHaveLength(0);
  });

  it('技术方案生成失败时保留待消费输入和批注摘要', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-tech-design-failed-');
    await prepareTechDesign(workspaceRoot);
    await createTechDesignAnnotation(workspaceRoot, '172014', annotationInput());
    const workflow = techDesignConsumptionWorkflow();

    const updated = await consumeTechDesignInputsAfterRun(workspaceRoot, workflow, designGenerateRun('FAILED'));
    const annotations = await listTechDesignAnnotations(workspaceRoot, '172014');
    const summary = await fs.readFile(path.join(workspaceRoot, techDesignAnnotationSummaryPath('172014')), 'utf8');

    expect(updated.techDesignClarification).toBe('补充异常场景');
    expect(updated.techDesignSourceFiles).toHaveLength(1);
    expect(updated.techDesignConsumedQuestionPaths).toEqual(['docs/172014/technical-design/questions/20260604-173000-question.md']);
    expect(annotations.annotations[0].consumedAt).toBeUndefined();
    expect(summary).toContain('Redis key');
  });

  it('中心批注在技术方案生成失败时不会被消费', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-tech-design-center-failed-');
    const fetchImpl = vi.fn(async () => centerResponse([]));
    const workflow = {
      ...techDesignConsumptionWorkflow(),
      id: 100
    };

    const updated = await consumeTechDesignInputsAfterRun(
      workspaceRoot,
      workflow,
      designGenerateRun('FAILED'),
      { userId: 1, fetchImpl }
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updated.techDesignClarification).toBe('补充异常场景');
    expect(updated.techDesignSourceFiles).toHaveLength(1);
  });
});
