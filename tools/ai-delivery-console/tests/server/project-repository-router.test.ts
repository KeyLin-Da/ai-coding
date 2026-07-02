import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRouter } from '../../server/router';

function routerRequest(method: string, url: string, headers: IncomingMessage['headers'] = {}): IncomingMessage {
  const stream = new Readable({
    read() {
      this.push(null);
    }
  }) as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function routerResponse(): { response: ServerResponse; done: Promise<{ status: number; body: any }> } {
  let status = 0;
  let resolveDone!: (value: { status: number; body: any }) => void;
  const done = new Promise<{ status: number; body: any }>((resolve) => {
    resolveDone = resolve;
  });
  const response = {
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
  return { response, done };
}

function jsonResponse(data: unknown, status = 200, code = '0', message = 'success'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ success: code === '0', code, message, data })
  } as Response;
}

function projectWithRepository(repoUrl: string) {
  return {
    id: 5,
    name: 'Demo',
    code: 'demo',
    repository: {
      id: 1,
      projectId: 5,
      provider: 'PROJECT_GIT',
      repoUrl,
      defaultBranch: 'master',
      repoCode: 'demo',
      status: 'ACTIVE'
    }
  };
}

describe('project repository router', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('缺少客户端会话ID时返回400而不是500', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-router-'));
    const router = createRouter(tempDir);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/api/ai-delivery/projects/5/delivery-workspace') {
        return jsonResponse({ id: 1, projectId: 5, localPath: tempDir, status: 'ACTIVE' });
      }
      if (parsed.pathname === '/api/ai-delivery/projects/my') {
        return jsonResponse([projectWithRepository(path.join(tempDir, 'remote.git'))]);
      }
      return jsonResponse(null, 404, 'B70004', '接口不存在');
    }));

    try {
      const { response, done } = routerResponse();
      await router(routerRequest('GET', '/api/ai-delivery/projects/5/repository/status', {
        'x-user-id': '1',
        'x-center-base-url': 'http://center.local'
      }), response);
      const result = await done;

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('B70003');
      expect(result.body.message).toBe('缺少客户端会话ID');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('当前项目未配置交付工作区时返回409而不是500', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-repo-router-'));
    const router = createRouter(tempDir);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/api/ai-delivery/projects/5/delivery-workspace') {
        return jsonResponse(null);
      }
      return jsonResponse(null, 404, 'B70004', '接口不存在');
    }));

    try {
      const { response, done } = routerResponse();
      await router(routerRequest('POST', '/api/ai-delivery/projects/5/repository/status/refresh', {
        'x-user-id': '1',
        'x-client-session-id': '9',
        'x-center-base-url': 'http://center.local'
      }), response);
      const result = await done;

      expect(result.status).toBe(409);
      expect(result.body.code).toBe('B70071');
      expect(result.body.message).toBe('请先在个人中心配置当前项目交付工作区');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
