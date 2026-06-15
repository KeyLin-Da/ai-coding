import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPrdClarificationRun, createRouter } from '../../server/router';
import type { RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';

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

describe('router requirement detail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('中心存在需求但本地没有 runtime state 时仍允许进入详情读路径', async () => {
    const workspaceRoot = await tmpDir('ai-delivery-router-workspace-');
    const deliveryRoot = await tmpDir('ai-delivery-router-delivery-');
    await fs.mkdir(path.join(deliveryRoot, 'opp-artifacts'), { recursive: true });

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/ai-delivery/users/me/delivery-workspace') {
        return centerResponse({
          id: 1,
          clientSessionId: 99,
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
      if (url.pathname === '/api/ai-delivery/users/me/delivery-workspace') {
        return centerResponse({
          id: 1,
          clientSessionId: 99,
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
});
