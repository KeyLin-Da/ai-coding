import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRouter } from '../../server/router';

function routerRequest(
  method: string,
  url: string,
  headers: IncomingMessage['headers'] = {},
  body = ''
): IncomingMessage {
  let sent = false;
  const stream = new Readable({
    read() {
      if (!sent && body) {
        this.push(body);
        sent = true;
      }
      this.push(null);
    }
  }) as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function routerResponse(): { response: ServerResponse; done: Promise<{ status: number; body: any; raw: Buffer }> } {
  let status = 0;
  let resolveDone!: (value: { status: number; body: any; raw: Buffer }) => void;
  const done = new Promise<{ status: number; body: any; raw: Buffer }>((resolve) => {
    resolveDone = resolve;
  });
  const response = {
    writeHead(nextStatus: number) {
      status = nextStatus;
    },
    end(rawBody?: string | Buffer) {
      const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
      let body: any;
      try {
        body = raw.length ? JSON.parse(raw.toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      resolveDone({ status, body, raw });
    }
  } as unknown as ServerResponse;
  return { response, done };
}

function jsonResponse(data: unknown, status = 200, code = '0', message = 'success'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ success: code === '0', code, message, data })
  } as Response;
}

function publicShare(pathname = 'docs/172014/technical-design/design_review.md') {
  return {
    id: 1,
    projectId: 10,
    requirementPk: 100,
    requirementId: '172014',
    artifactPath: pathname,
    status: 'ENABLED',
    showAnnotations: false,
    allowDownload: false
  };
}

function projectWithRepository() {
  return {
    id: 10,
    name: 'Demo',
    code: 'demo',
    repository: {
      id: 1,
      projectId: 10,
      provider: 'PROJECT_GIT',
      repoUrl: 'git@git.example.com:opp/demo.git',
      defaultBranch: 'master',
      repoCode: 'demo',
      status: 'ACTIVE'
    }
  };
}

describe('artifact share router', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('公开 preview 通过 Center token 后读取当前受控产物内容', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-router-'));
    await fs.mkdir(path.join(tempDir, 'docs/172014/technical-design'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'docs/172014/technical-design/design_review.md'), '# 技术方案\n当前内容', 'utf8');
    const router = createRouter(tempDir);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(publicShare())));

    try {
      const { response, done } = routerResponse();
      await router(routerRequest('GET', '/api/ai-delivery/public-artifact-shares/token-1/preview'), response);
      const result = await done;

      expect(result.status).toBe(200);
      expect(result.body.data.content).toContain('当前内容');
      expect(result.body.data.allowDownload).toBe(false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('公开 assets 拒绝路径穿越', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-router-'));
    await fs.mkdir(path.join(tempDir, 'docs/172014/technical-design'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'docs/172014/technical-design/design_review.md'), '# 技术方案', 'utf8');
    const router = createRouter(tempDir);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(publicShare())));

    try {
      const { response, done } = routerResponse();
      await router(
        routerRequest('GET', '/api/ai-delivery/public-artifact-shares/token-1/assets?path=../../workflow/state.png'),
        response
      );
      const result = await done;

      expect(result.status).toBe(403);
      expect(result.body.code).toBe('B70080');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('公开 preview 在 Runner 当前不可读时返回分享内容不可读取', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-router-'));
    const router = createRouter(tempDir);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(publicShare())));

    try {
      const { response, done } = routerResponse();
      await router(routerRequest('GET', '/api/ai-delivery/public-artifact-shares/token-1/preview'), response);
      const result = await done;

      expect(result.status).toBe(404);
      expect(result.body.code).toBe('B70081');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('创建分享后匿名 preview 从独立产物仓读取且 Runner 重启后恢复绑定', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-binding-'));
    const runnerRoot = path.join(tempDir, 'runner');
    const deliveryRoot = path.join(tempDir, 'delivery');
    const repoRoot = path.join(deliveryRoot, 'demo');
    await fs.mkdir(path.join(repoRoot, 'docs/172014/technical-design'), { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'docs/172014/technical-design/design_review.md'), '# 技术方案\n独立仓内容', 'utf8');
    vi.stubEnv('AI_DELIVERY_PRIVATE_ROOT', path.join(tempDir, 'private'));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === '/api/ai-delivery/projects/10/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 10, localPath: deliveryRoot, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([projectWithRepository()]);
      }
      if (parsed.pathname === '/api/ai-delivery/artifact-shares/public' && init?.method === 'POST') {
        return jsonResponse({ ...publicShare(), token: 'token-1' });
      }
      if (parsed.pathname === '/api/ai-delivery/artifact-shares' && init?.method !== 'POST') {
        return jsonResponse([publicShare()]);
      }
      if (parsed.pathname === '/api/ai-delivery/public-artifact-shares/token-1') {
        return jsonResponse(publicShare());
      }
      return jsonResponse(null, 404, 'B70004', '接口不存在');
    }));

    try {
      const router = createRouter(runnerRoot);
      const createResult = routerResponse();
      await router(
        routerRequest(
          'POST',
          '/api/ai-delivery/artifact-shares/public',
          {
            'content-type': 'application/json',
            'x-user-id': '1',
            'x-project-id': '10',
            'x-center-base-url': 'http://center.local'
          },
          JSON.stringify({
            projectId: 10,
            requirementId: '172014',
            artifactPath: 'docs/172014/technical-design/design_review.md'
          })
        ),
        createResult.response
      );
      expect((await createResult.done).status).toBe(200);

      const restartedRouter = createRouter(runnerRoot);
      const previewResult = routerResponse();
      await restartedRouter(
        routerRequest('GET', '/api/ai-delivery/public-artifact-shares/token-1/preview'),
        previewResult.response
      );
      const result = await previewResult.done;
      expect(result.status).toBe(200);
      expect(result.body.data.content).toContain('独立仓内容');
      expect(JSON.stringify(result.body)).not.toContain(repoRoot);

      const listResult = routerResponse();
      await restartedRouter(
        routerRequest('GET', '/api/ai-delivery/artifact-shares?projectId=10', {
          'x-user-id': '1',
          'x-project-id': '10',
          'x-center-base-url': 'http://center.local'
        }),
        listResult.response
      );
      const listed = await listResult.done;
      expect(listed.status).toBe(200);
      expect(listed.body.data[0].publicPath).toBe('/share/artifacts/token-1');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('历史分享重新生成 token 后持久化新公开链接', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-regenerate-'));
    const runnerRoot = path.join(tempDir, 'runner');
    const deliveryRoot = path.join(tempDir, 'delivery');
    const repoRoot = path.join(deliveryRoot, 'demo');
    await fs.mkdir(path.join(repoRoot, 'docs/172014/technical-design'), { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'docs/172014/technical-design/design_review.md'), '# 技术方案', 'utf8');
    vi.stubEnv('AI_DELIVERY_PRIVATE_ROOT', path.join(tempDir, 'private'));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === '/api/ai-delivery/projects/10/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 10, localPath: deliveryRoot, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([projectWithRepository()]);
      }
      if (parsed.pathname === '/api/ai-delivery/artifact-shares/1/token/regenerate' && init?.method === 'POST') {
        return jsonResponse({ ...publicShare(), token: 'token-2' });
      }
      if (parsed.pathname === '/api/ai-delivery/artifact-shares') {
        return jsonResponse([publicShare()]);
      }
      return jsonResponse(null, 404, 'B70004', '接口不存在');
    }));

    try {
      const router = createRouter(runnerRoot);
      const regenerateResult = routerResponse();
      await router(
        routerRequest('POST', '/api/ai-delivery/artifact-shares/1/token/regenerate', {
          'x-user-id': '1',
          'x-project-id': '10',
          'x-center-base-url': 'http://center.local'
        }),
        regenerateResult.response
      );
      const regenerated = await regenerateResult.done;
      expect(regenerated.status).toBe(200);
      expect(regenerated.body.data.publicPath).toBe('/share/artifacts/token-2');

      const listResult = routerResponse();
      await router(
        routerRequest('GET', '/api/ai-delivery/artifact-shares?projectId=10', {
          'x-user-id': '1',
          'x-project-id': '10',
          'x-center-base-url': 'http://center.local'
        }),
        listResult.response
      );
      const listed = await listResult.done;
      expect(listed.body.data[0].publicPath).toBe('/share/artifacts/token-2');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('查询已有分享后为旧链接补齐本地产物仓绑定', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-rebind-'));
    const runnerRoot = path.join(tempDir, 'runner');
    const deliveryRoot = path.join(tempDir, 'delivery');
    const repoRoot = path.join(deliveryRoot, 'demo');
    await fs.mkdir(path.join(repoRoot, 'docs/172014/technical-design'), { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'docs/172014/technical-design/design_review.md'), '# 技术方案\n旧链接内容', 'utf8');
    vi.stubEnv('AI_DELIVERY_PRIVATE_ROOT', path.join(tempDir, 'private'));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === '/api/ai-delivery/projects/10/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 10, localPath: deliveryRoot, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([projectWithRepository()]);
      }
      if (parsed.pathname === '/api/ai-delivery/artifact-shares') {
        return jsonResponse([publicShare()]);
      }
      if (parsed.pathname === '/api/ai-delivery/public-artifact-shares/token-1') {
        return jsonResponse(publicShare());
      }
      return jsonResponse(null, 404, 'B70004', '接口不存在');
    }));

    try {
      const router = createRouter(runnerRoot);
      const listResult = routerResponse();
      await router(
        routerRequest('GET', '/api/ai-delivery/artifact-shares?projectId=10', {
          'x-user-id': '1',
          'x-project-id': '10',
          'x-center-base-url': 'http://center.local'
        }),
        listResult.response
      );
      expect((await listResult.done).status).toBe(200);

      const previewResult = routerResponse();
      await router(
        routerRequest('GET', '/api/ai-delivery/public-artifact-shares/token-1/preview'),
        previewResult.response
      );
      const result = await previewResult.done;
      expect(result.status).toBe(200);
      expect(result.body.data.content).toContain('旧链接内容');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('/api/artifacts/read 使用真实根目录判断拒绝前缀误判路径', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-share-router-'));
    await fs.mkdir(path.join(tempDir, 'demo'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'demo-evil'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'demo-evil/secret.png'), 'secret', 'utf8');
    const router = createRouter(tempDir);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/api/ai-delivery/projects/10/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 10, localPath: tempDir, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([projectWithRepository()]);
      }
      return jsonResponse(null, 404, 'B70004', '接口不存在');
    }));

    try {
      const { response, done } = routerResponse();
      await router(
        routerRequest('GET', '/api/artifacts/read?path=../demo-evil/secret.png', {
          'x-user-id': '1',
          'x-project-id': '10',
          'x-center-base-url': 'http://center.local'
        }),
        response
      );
      const result = await done;

      expect(result.status).toBe(403);
      expect(result.body.message).toContain('路径不在工作区内');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
