import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { ActionInput, RequirementInput, ReviewInput } from '../shared/workflow';
import { normalizePrdClarification, WorkflowRepository } from './services/workflow-repository';
import { scanRequirementArtifacts } from './services/workspace-scanner';
import { WorkflowLock } from './services/workflow-lock';
import { executeAction } from './services/action-adapters';
import { readRunEvents, appendStageCommandLog } from './services/run-log';
import { readArtifact, saveArtifact } from './services/markdown-service';
import { applyReview, refreshCodeReviewIssues, returnToImplementation } from './services/review-service';
import { cancelAgentRun, listAgentProviders } from './services/agent-providers';

async function parseBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  response.end(JSON.stringify(body));
}

function match(pathname: string, pattern: RegExp): RegExpMatchArray | null {
  return pathname.match(pattern);
}

export function createRouter(workspaceRoot: string) {
  const repository = new WorkflowRepository(workspaceRoot);

  return async function router(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'OPTIONS') {
      send(response, 204, {});
      return;
    }

    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const pathname = url.pathname;

      if (request.method === 'GET' && pathname === '/api/ai-delivery/agents') {
        send(response, 200, { data: await listAgentProviders() });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/requirements') {
        send(response, 200, { data: await repository.list() });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/requirements') {
        const input = await parseBody<RequirementInput>(request);
        let workflow = await repository.upsert(input);
        workflow.artifacts = await scanRequirementArtifacts(workspaceRoot, workflow.requirementId, workflow.branchName);
        workflow = await repository.save(workflow);
        send(response, 200, { data: workflow });
        return;
      }

      const requirementMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)$/);
      if (request.method === 'GET' && requirementMatch) {
        const workflow = await repository.load(requirementMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: workflow });
        return;
      }

      const actionMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/actions$/);
      if (request.method === 'POST' && actionMatch) {
        const requirementId = actionMatch[1];
        const action = await parseBody<ActionInput>(request);
        const lock = new WorkflowLock(workspaceRoot, requirementId);
        await lock.acquire();
        try {
          let workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          if (action.actionType === 'PRD_ANALYZE') {
            const params = action.params || {};
            const sources = Array.isArray(params.sources)
              ? params.sources.map((item) => String(item).trim()).filter(Boolean)
              : workflow.sources;
            workflow = {
              ...workflow,
              sources,
              prdClarification: normalizePrdClarification(typeof params.description === 'string' ? params.description : workflow.prdClarification)
            };
          }
          if (action.actionType === 'DESIGN_GENERATE') {
            const params = action.params || {};
            workflow = {
              ...workflow,
              techDesignDocument: typeof params.documentPath === 'string' ? params.documentPath : workflow.techDesignDocument,
              techDesignClarification: typeof params.clarification === 'string' ? params.clarification : workflow.techDesignClarification
            };
          }
          const run = await executeAction(workspaceRoot, workflow, action, async (updatedRun) => {
            const latest = await repository.load(requirementId);
            if (!latest) {
              return;
            }
            const index = latest.runs.findIndex((item) => item.id === updatedRun.id);
            if (index >= 0) {
              latest.runs[index] = updatedRun;
            } else {
              latest.runs.unshift(updatedRun);
            }
            await repository.save(latest);
          });
          
          // 为每个流程阶段记录命令日志
          const stageMap: Record<string, 'PRD' | 'TECH_DESIGN' | 'IMPLEMENTATION' | 'CODE_REVIEW'> = {
            PRD_ANALYZE: 'PRD',
            DESIGN_GENERATE: 'TECH_DESIGN',
            OPENSPEC_STATUS: 'IMPLEMENTATION',
            OPENSPEC_VERIFY: 'IMPLEMENTATION',
            JUNIT_GENERATE: 'IMPLEMENTATION',
            CODE_REVIEW_GENERATE: 'CODE_REVIEW'
          };
          const stage = stageMap[action.actionType];
          if (stage && run.commandText) {
            await appendStageCommandLog(
              workspaceRoot,
              requirementId,
              stage,
              run.commandText,
              {
                runId: run.id,
                agentId: run.agentId,
                status: run.status
              }
            );
          }
          workflow.runs.unshift(run);
          if (action.actionType === 'REFRESH_ARTIFACTS') {
            workflow.artifacts = await scanRequirementArtifacts(workspaceRoot, workflow.requirementId, workflow.branchName);
          }
          if (action.actionType === 'RETURN_TO_IMPLEMENTATION') {
            const issues = await refreshCodeReviewIssues(workspaceRoot, workflow);
            workflow = returnToImplementation(workflow, issues);
          }
          workflow = await repository.save(workflow);
          send(response, 200, { data: { run, workflow } });
        } finally {
          await lock.release();
        }
        return;
      }

      const runMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/events$/);
      if (request.method === 'GET' && runMatch) {
        const requirementId = url.searchParams.get('requirementId') || '';
        send(response, 200, { data: await readRunEvents(workspaceRoot, requirementId, runMatch[1]) });
        return;
      }

      const runStreamMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/stream$/);
      if (request.method === 'GET' && runStreamMatch) {
        const requirementId = url.searchParams.get('requirementId') || '';
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        let sent = 0;
        let interval: NodeJS.Timeout | undefined;
        const push = async () => {
          const events = await readRunEvents(workspaceRoot, requirementId, runStreamMatch[1]);
          for (const event of events.slice(sent)) {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
          }
          sent = events.length;
          const workflow = await repository.load(requirementId);
          const run = workflow?.runs.find((item) => item.id === runStreamMatch[1]);
          if (run && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'WAITING_FOR_AGENT'].includes(run.status)) {
            if (interval) {
              clearInterval(interval);
            }
            response.end();
          }
        };
        interval = setInterval(() => {
          push().catch((error) => {
            response.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
          });
        }, 500);
        request.on('close', () => clearInterval(interval));
        await push();
        return;
      }

      const cancelMatch = match(pathname, /^\/api\/ai-delivery\/runs\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelMatch) {
        const body = await parseBody<{ requirementId: string }>(request);
        const cancelled = await cancelAgentRun(workspaceRoot, body.requirementId, cancelMatch[1]);
        const workflow = await repository.load(body.requirementId);
        if (workflow) {
          const run = workflow.runs.find((item) => item.id === cancelMatch[1]);
          if (run && cancelled) {
            run.status = 'CANCELLED';
            run.finishedAt = new Date().toISOString();
            await repository.save(workflow);
          }
        }
        send(response, 200, { data: { cancelled } });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/artifacts') {
        const filePath = url.searchParams.get('path');
        if (!filePath) {
          send(response, 400, { message: '缺少 path 参数' });
          return;
        }
        send(response, 200, { data: await readArtifact(workspaceRoot, filePath) });
        return;
      }

      // 读取图片等二进制文件
      if (request.method === 'GET' && pathname === '/api/artifacts/read') {
        const filePath = url.searchParams.get('path');
        if (!filePath) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: '缺少 path 参数' }));
          return;
        }
        try {
          const fs = await import('node:fs/promises');
          const pathModule = await import('node:path');
          const absolutePath = pathModule.resolve(workspaceRoot, filePath);
          
          // 安全检查：确保文件在工作区内
          if (!absolutePath.startsWith(workspaceRoot)) {
            response.writeHead(403, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ message: '不允许访问工作区外的文件' }));
            return;
          }
          
          const fileBuffer = await fs.readFile(absolutePath);
          
          // 根据文件扩展名设置 Content-Type
          const ext = pathModule.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          
          response.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
          });
          response.end(fileBuffer);
        } catch (error: any) {
          response.writeHead(404, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ message: error.code === 'ENOENT' ? '文件不存在' : error.message }));
        }
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/artifacts') {
        const body = await parseBody<{ path: string; content: string; expectedHash?: string }>(request);
        send(response, 200, { data: await saveArtifact(workspaceRoot, body.path, body.content, body.expectedHash) });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/reviews') {
        const input = await parseBody<ReviewInput>(request);
        const lock = new WorkflowLock(workspaceRoot, input.requirementId);
        await lock.acquire();
        try {
          let workflow = await repository.load(input.requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          workflow = await applyReview(workspaceRoot, workflow, input);
          if (input.stage === 'CODE_REVIEW') {
            workflow.issues = await refreshCodeReviewIssues(workspaceRoot, workflow);
          }
          workflow = await repository.save(workflow);
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      send(response, 404, { message: '接口不存在' });
    } catch (error: any) {
      const status = error.code === 'ARTIFACT_CONFLICT' ? 409 : 500;
      send(response, status, { message: error.message || '服务异常', data: error.currentHash ? { currentHash: error.currentHash } : undefined });
    }
  };
}
