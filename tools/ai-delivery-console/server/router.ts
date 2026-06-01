import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import type { ActionInput, PrdSourceFile, RequirementInput, RequirementWorkflow, ReviewInput, RunRecord, TechDesignSourceFile, WorkflowStatus } from '../shared/workflow';
import { ensureImplementationSteps, stageForAction } from '../shared/workflow';
import { normalizePrdClarification, WorkflowRepository } from './services/workflow-repository';
import { scanRequirementArtifacts } from './services/workspace-scanner';
import { WorkflowLock } from './services/workflow-lock';
import { buildActionCommand, executeAction, validateActionInput } from './services/action-adapters';
import { readRunEvents, appendStageCommandLog } from './services/run-log';
import { readArtifact, saveArtifact } from './services/markdown-service';
import { applyReview, refreshCodeReviewIssues, returnToImplementation } from './services/review-service';
import { cancelAgentRun, listAgentProviders, refreshTerminalRunStatuses } from './services/agent-providers';
import { normalizeOpenSpecChangeName, readOpenSpecSummary, updateOpenSpecTaskStatus } from './services/openspec-summary';
import { readGitChanges } from './services/git-changes';
import { readProjectHistory, saveProjectHistory, listProjectsFromConfiguredPaths } from './services/project-history';
import { loadSettings, saveSettings, validateSettings } from './services/project-settings';
import {
  assertAllowedPrdSourceFile,
  deletePrdSourceFileSnapshot,
  deleteTechDesignSourceFileSnapshot,
  savePrdSourceFileSnapshot,
  saveTechDesignSourceFileSnapshot,
  type UploadedPrdSourceFile
} from './services/prd-source-files';

async function parseBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index >= 0) {
    parts.push(buffer.subarray(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function parseDisposition(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawValue.length) {
      continue;
    }
    result[rawKey] = rawValue.join('=').replace(/^"|"$/g, '');
  }
  return result;
}

function designDocumentPath(workflow: RequirementWorkflow, params: Record<string, unknown>): string {
  if (typeof params.documentPath === 'string' && params.documentPath.trim()) {
    return params.documentPath.trim();
  }
  const prdArtifactPath = workflow.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path;
  return prdArtifactPath || workflow.stages.PRD.artifactPath || `docs/${workflow.requirementId}/prd/analysis.md`;
}

function implementationStatusForRun(run: RunRecord): WorkflowStatus {
  if (run.status === 'SUCCEEDED') {
    return 'READY_FOR_REVIEW';
  }
  if (run.status === 'FAILED' || run.status === 'CANCELLED') {
    return 'BLOCKED';
  }
  return 'IN_PROGRESS';
}

function applyImplementationRun(workflow: RequirementWorkflow, run: RunRecord): RequirementWorkflow {
  if (!run.implementationStep) {
    return workflow;
  }
  const implementationSteps = ensureImplementationSteps(workflow.implementationSteps);
  implementationSteps[run.implementationStep] = {
    ...implementationSteps[run.implementationStep],
    status: implementationStatusForRun(run),
    runId: run.id
  };
  return {
    ...workflow,
    implementationSteps,
    stages: {
      ...workflow.stages,
      IMPLEMENTATION: {
        ...workflow.stages.IMPLEMENTATION,
        status: workflow.stages.IMPLEMENTATION.status === 'APPROVED' ? 'APPROVED' : 'IN_PROGRESS',
        runId: run.id
      }
    }
  };
}

async function parseMultipartFiles(request: IncomingMessage): Promise<UploadedPrdSourceFile[]> {
  const contentType = request.headers['content-type'] || '';
  const boundary = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) {
    throw new Error('缺少 multipart boundary');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const files: UploadedPrdSourceFile[] = [];
  for (const rawPart of splitBuffer(body, boundaryBuffer)) {
    let part = rawPart;
    if (part.length < 4 || part.equals(Buffer.from('--\r\n')) || part.equals(Buffer.from('--'))) {
      continue;
    }
    if (part.subarray(0, 2).equals(Buffer.from('\r\n'))) {
      part = part.subarray(2);
    }
    if (part.subarray(part.length - 2).equals(Buffer.from('\r\n'))) {
      part = part.subarray(0, part.length - 2);
    }
    if (part.subarray(part.length - 2).equals(Buffer.from('--'))) {
      part = part.subarray(0, part.length - 2);
    }
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) {
      continue;
    }
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    const content = part.subarray(headerEnd + 4);
    const headers = Object.fromEntries(
      headerText.split('\r\n').map((line) => {
        const [name, ...value] = line.split(':');
        return [name.toLowerCase(), value.join(':').trim()];
      })
    );
    const disposition = parseDisposition(headers['content-disposition'] || '');
    if (!disposition.filename) {
      continue;
    }
    files.push({
      filename: path.basename(disposition.filename),
      mimeType: headers['content-type'],
      content
    });
  }
  return files;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
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

      if (request.method === 'GET' && pathname === '/api/ai-delivery/project-history') {
        send(response, 200, { data: await readProjectHistory(workspaceRoot) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/projects') {
        send(response, 200, { data: await listProjectsFromConfiguredPaths(workspaceRoot) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/settings') {
        send(response, 200, { data: await loadSettings(workspaceRoot) });
        return;
      }

      if (request.method === 'PUT' && pathname === '/api/ai-delivery/settings') {
        const settings = await parseBody<{ projectPaths: string[] }>(request);
        const error = validateSettings(settings);
        if (error) {
          send(response, 400, { message: error });
          return;
        }
        send(response, 200, { data: await saveSettings(workspaceRoot, settings) });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/ai-delivery/requirements') {
        const workflows = await Promise.all(
          (await repository.list()).map(async (workflow) => {
            const refreshed = await refreshTerminalRunStatuses(workspaceRoot, workflow);
            return refreshed.changed ? repository.save(refreshed.workflow) : refreshed.workflow;
          })
        );
        send(response, 200, { data: workflows });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/ai-delivery/requirements') {
        const input = await parseBody<RequirementInput>(request);
        let workflow = await repository.upsert(input);
        workflow.artifacts = await scanRequirementArtifacts(workspaceRoot, workflow.requirementId, workflow.branchName, workflow.stages.IMPLEMENTATION.changeName);
        workflow = await repository.save(workflow);
        send(response, 200, { data: workflow });
        return;
      }

      const requirementMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)$/);
      if (request.method === 'GET' && requirementMatch) {
        let workflow = await repository.load(requirementMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const refreshed = await refreshTerminalRunStatuses(workspaceRoot, workflow);
        workflow = refreshed.workflow;
        // 扫描并更新产物索引
        workflow.artifacts = await scanRequirementArtifacts(workspaceRoot, workflow.requirementId, workflow.branchName, workflow.stages.IMPLEMENTATION.changeName);
        workflow = await repository.save(workflow);
        send(response, 200, { data: workflow });
        return;
      }

      const openSpecSummaryMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/openspec-summary$/);
      if (request.method === 'GET' && openSpecSummaryMatch) {
        const workflow = await repository.load(openSpecSummaryMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
        const changeName = normalizeOpenSpecChangeName(url.searchParams.get('changeName') || fallbackChangeName, fallbackChangeName);
        send(response, 200, { data: await readOpenSpecSummary(workspaceRoot, changeName, fallbackChangeName) });
        return;
      }

      const openSpecTaskMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/openspec-tasks$/);
      if (request.method === 'POST' && openSpecTaskMatch) {
        const requirementId = openSpecTaskMatch[1];
        const input = await parseBody<{ changeName?: string; line: number; completed: boolean; raw?: string }>(request);
        const lock = new WorkflowLock(workspaceRoot, requirementId);
        await lock.acquire();
        try {
          const workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
          const changeName = normalizeOpenSpecChangeName(input.changeName || fallbackChangeName, fallbackChangeName);
          send(response, 200, {
            data: await updateOpenSpecTaskStatus(workspaceRoot, changeName, fallbackChangeName, Number(input.line), Boolean(input.completed), input.raw)
          });
        } finally {
          await lock.release();
        }
        return;
      }

      const gitChangesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/git-changes$/);
      if (request.method === 'GET' && gitChangesMatch) {
        const workflow = await repository.load(gitChangesMatch[1]);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        send(response, 200, { data: await readGitChanges(workspaceRoot, workflow.projects || [], workflow.branchName) });
        return;
      }

      const prdFilesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/prd-files$/);
      if (request.method === 'POST' && prdFilesMatch) {
        const requirementId = prdFilesMatch[1];
        const files = await parseMultipartFiles(request);
        if (!files.length) {
          send(response, 400, { message: '请至少选择一个 PRD 来源文件' });
          return;
        }
        const lock = new WorkflowLock(workspaceRoot, requirementId);
        await lock.acquire();
        try {
          let workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          files.forEach(assertAllowedPrdSourceFile);
          const snapshots: PrdSourceFile[] = [];
          for (const file of files) {
            snapshots.push(await savePrdSourceFileSnapshot(workspaceRoot, workflow.requirementId, file));
          }
          const sources = new Set([...workflow.sources, ...snapshots.map((file) => file.path)]);
          workflow = await repository.save({
            ...workflow,
            prdSourceFiles: [...(workflow.prdSourceFiles || []), ...snapshots],
            sources: [...sources]
          });
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const prdFileDeleteMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/prd-files\/([^/]+)$/);
      if (request.method === 'DELETE' && prdFileDeleteMatch) {
        const requirementId = prdFileDeleteMatch[1];
        const fileId = decodeURIComponent(prdFileDeleteMatch[2]);
        const lock = new WorkflowLock(workspaceRoot, requirementId);
        await lock.acquire();
        try {
          let workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          workflow = await repository.save(await deletePrdSourceFileSnapshot(workspaceRoot, workflow, fileId));
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignFilesMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-files$/);
      if (request.method === 'POST' && techDesignFilesMatch) {
        const requirementId = techDesignFilesMatch[1];
        const files = await parseMultipartFiles(request);
        if (!files.length) {
          send(response, 400, { message: '请至少选择一个技术方案补充材料' });
          return;
        }
        const lock = new WorkflowLock(workspaceRoot, requirementId);
        await lock.acquire();
        try {
          let workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          files.forEach(assertAllowedPrdSourceFile);
          const snapshots: TechDesignSourceFile[] = [];
          for (const file of files) {
            snapshots.push(await saveTechDesignSourceFileSnapshot(workspaceRoot, workflow.requirementId, file));
          }
          const nextWorkflow = {
            ...workflow,
            techDesignSourceFiles: [...(workflow.techDesignSourceFiles || []), ...snapshots]
          };
          workflow = await repository.save({
            ...nextWorkflow,
            artifacts: await scanRequirementArtifacts(workspaceRoot, nextWorkflow.requirementId, nextWorkflow.branchName, nextWorkflow.stages.IMPLEMENTATION.changeName)
          });
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const techDesignFileDeleteMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/tech-design-files\/([^/]+)$/);
      if (request.method === 'DELETE' && techDesignFileDeleteMatch) {
        const requirementId = techDesignFileDeleteMatch[1];
        const fileId = decodeURIComponent(techDesignFileDeleteMatch[2]);
        const lock = new WorkflowLock(workspaceRoot, requirementId);
        await lock.acquire();
        try {
          let workflow = await repository.load(requirementId);
          if (!workflow) {
            send(response, 404, { message: '需求不存在' });
            return;
          }
          const nextWorkflow = await deleteTechDesignSourceFileSnapshot(workspaceRoot, workflow, fileId);
          workflow = await repository.save({
            ...nextWorkflow,
            artifacts: await scanRequirementArtifacts(workspaceRoot, nextWorkflow.requirementId, nextWorkflow.branchName, nextWorkflow.stages.IMPLEMENTATION.changeName)
          });
          send(response, 200, { data: workflow });
        } finally {
          await lock.release();
        }
        return;
      }

      const actionMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/actions$/);
      if (request.method === 'POST' && actionMatch) {
        const requirementId = actionMatch[1];
        const action = await parseBody<ActionInput>(request);
        if (action.params?.executionMode === 'MANUAL_COPY') {
          send(response, 400, { message: '手动复制执行方式请使用命令预览接口' });
          return;
        }
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
            const documentPath = designDocumentPath(workflow, params);
            workflow = {
              ...workflow,
              techDesignDocument: documentPath,
              techDesignClarification: typeof params.clarification === 'string' ? params.clarification : workflow.techDesignClarification
            };
          }
          if (['OPENSPEC_STATUS', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_FF', 'OPENSPEC_APPLY', 'OPENSPEC_VERIFY', 'OPENSPEC_ARCHIVE'].includes(action.actionType)) {
            const params = action.params || {};
            const changeName = normalizeOpenSpecChangeName(typeof params.changeName === 'string' ? params.changeName : '', workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`);
            workflow = {
              ...workflow,
              stages: {
                ...workflow.stages,
                IMPLEMENTATION: {
                  ...workflow.stages.IMPLEMENTATION,
                  changeName
                }
              }
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
          
          const stage = run.stage || stageForAction(action.actionType);
          if (stage) {
            await appendStageCommandLog(
              workspaceRoot,
              requirementId,
              stage,
              run.commandText || action.actionType,
              {
                runId: run.id,
                actionType: run.actionType,
                implementationStep: run.implementationStep,
                agentId: run.agentId,
                status: run.status
              }
            );
          }
          workflow.runs.unshift(run);
          workflow = applyImplementationRun(workflow, run);
          if (action.actionType === 'REFRESH_ARTIFACTS') {
            workflow.artifacts = await scanRequirementArtifacts(workspaceRoot, workflow.requirementId, workflow.branchName, workflow.stages.IMPLEMENTATION.changeName);
          }
          // PRD分析、技术方案生成等可能产生产物的操作，执行完成后自动刷新产物索引
          if (['PRD_ANALYZE', 'DESIGN_GENERATE', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_ARCHIVE'].includes(action.actionType)) {
            workflow.artifacts = await scanRequirementArtifacts(workspaceRoot, workflow.requirementId, workflow.branchName, workflow.stages.IMPLEMENTATION.changeName);
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

      const actionCommandMatch = match(pathname, /^\/api\/ai-delivery\/requirements\/([^/]+)\/actions\/command$/);
      if (request.method === 'POST' && actionCommandMatch) {
        const requirementId = actionCommandMatch[1];
        const action = await parseBody<ActionInput>(request);
        let workflow = await repository.load(requirementId);
        if (!workflow) {
          send(response, 404, { message: '需求不存在' });
          return;
        }
        validateActionInput(workspaceRoot, action);
        const params = action.params || {};
        if (action.actionType === 'DESIGN_GENERATE') {
          workflow = {
            ...workflow,
            techDesignDocument: designDocumentPath(workflow, params)
          };
        }
        if (['OPENSPEC_STATUS', 'OPENSPEC_NEW_CHANGE', 'OPENSPEC_FF', 'OPENSPEC_APPLY', 'OPENSPEC_VERIFY', 'OPENSPEC_ARCHIVE'].includes(action.actionType)) {
          const fallbackChangeName = workflow.stages.IMPLEMENTATION.changeName || `req-${workflow.requirementId}`;
          const changeName = normalizeOpenSpecChangeName(typeof params.changeName === 'string' ? params.changeName : '', fallbackChangeName);
          workflow = {
            ...workflow,
            stages: {
              ...workflow.stages,
              IMPLEMENTATION: {
                ...workflow.stages.IMPLEMENTATION,
                changeName
              }
            }
          };
        }
        send(response, 200, { data: { commandText: buildActionCommand(workflow, action) } });
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
          if (run && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'WAITING_FOR_AGENT', 'TERMINAL_OPENED'].includes(run.status)) {
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
            '.html': 'text/html; charset=utf-8',
            '.htm': 'text/html; charset=utf-8',
            '.md': 'text/markdown; charset=utf-8',
            '.markdown': 'text/markdown; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.txt': 'text/plain; charset=utf-8',
            '.log': 'text/plain; charset=utf-8',
            '.xml': 'application/xml; charset=utf-8',
            '.yaml': 'text/yaml; charset=utf-8',
            '.yml': 'text/yaml; charset=utf-8',
            '.pdf': 'application/pdf',
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
