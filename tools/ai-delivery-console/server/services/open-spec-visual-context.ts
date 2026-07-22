import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ActionInput,
  OpenSpecVisualContextCandidate,
  OpenSpecVisualContextSnapshot,
  OpenSpecVisualContextSource,
  PrdSourceFile,
  RequirementWorkflow
} from '../../shared/workflow';
import { assertInsideWorkspace, hashContent, normalizeRequirementId, toRelativePath } from './workspace';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

function normalizePath(value = ''): string {
  return value.trim().replace(/\\/g, '/');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

export function isVisualContextImagePath(filePath: string): boolean {
  return imageExtensions.has(path.extname(filePath).toLowerCase());
}

function mimeTypeForImage(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return mimeTypes[ext];
}

async function statCandidate(workspaceRoot: string, relativePath: string): Promise<Pick<OpenSpecVisualContextCandidate, 'size' | 'uploadedAt'> | undefined> {
  try {
    const stat = await fs.stat(assertInsideWorkspace(workspaceRoot, relativePath));
    if (!stat.isFile()) {
      return undefined;
    }
    return {
      size: stat.size,
      uploadedAt: stat.mtime.toISOString()
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function candidateFromFile(
  workspaceRoot: string,
  file: Pick<PrdSourceFile, 'name' | 'path'> & Partial<Pick<PrdSourceFile, 'id' | 'size' | 'mimeType' | 'uploadedAt'>>,
  source: OpenSpecVisualContextSource
): Promise<OpenSpecVisualContextCandidate | undefined> {
  const relativePath = normalizePath(file.path);
  if (!relativePath || !isVisualContextImagePath(relativePath)) {
    return undefined;
  }
  const stat = await statCandidate(workspaceRoot, relativePath);
  if (!stat && file.size == null) {
    return undefined;
  }
  return {
    id: `${source}:${relativePath}`,
    name: file.name || path.basename(relativePath),
    path: relativePath,
    source,
    size: file.size ?? stat?.size,
    mimeType: file.mimeType || mimeTypeForImage(relativePath),
    uploadedAt: file.uploadedAt || stat?.uploadedAt
  };
}

async function listImageFiles(workspaceRoot: string, relativeDir: string): Promise<OpenSpecVisualContextCandidate[]> {
  const absoluteDir = assertInsideWorkspace(workspaceRoot, relativeDir);
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const candidates: OpenSpecVisualContextCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isVisualContextImagePath(entry.name)) {
      continue;
    }
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = normalizePath(toRelativePath(workspaceRoot, absolutePath));
    const stat = await fs.stat(absolutePath);
    candidates.push({
      id: `PRD_FILES:${relativePath}`,
      name: entry.name,
      path: relativePath,
      source: 'PRD_FILES',
      size: stat.size,
      mimeType: mimeTypeForImage(relativePath),
      uploadedAt: stat.mtime.toISOString()
    });
  }
  return candidates;
}

function addCandidate(target: Map<string, OpenSpecVisualContextCandidate>, candidate: OpenSpecVisualContextCandidate | undefined): void {
  if (!candidate) {
    return;
  }
  const key = normalizePath(candidate.path);
  if (!key || target.has(key)) {
    return;
  }
  target.set(key, { ...candidate, path: key });
}

export async function listOpenSpecVisualContextCandidates(
  workspaceRoot: string,
  workflow: RequirementWorkflow
): Promise<OpenSpecVisualContextCandidate[]> {
  const requirementId = normalizeRequirementId(workflow.requirementId);
  const candidates = new Map<string, OpenSpecVisualContextCandidate>();

  for (const file of workflow.prdSourceFiles || []) {
    addCandidate(candidates, await candidateFromFile(workspaceRoot, file, 'PRD_SOURCE'));
  }
  for (const file of workflow.techDesignSourceFiles || []) {
    addCandidate(candidates, await candidateFromFile(workspaceRoot, file, 'TECH_DESIGN_SOURCE'));
  }

  const prdFilesDir = `docs/${requirementId}/prd/files`;
  for (const candidate of await listImageFiles(workspaceRoot, prdFilesDir)) {
    addCandidate(candidates, candidate);
  }
  for (const candidate of await listImageFiles(workspaceRoot, `${prdFilesDir}/screenshots`)) {
    addCandidate(candidates, { ...candidate, id: `PRD_FILES:${candidate.path}` });
  }

  const techDesignFileDir = `docs/${requirementId}/technical-design/file`;
  for (const candidate of await listImageFiles(workspaceRoot, techDesignFileDir)) {
    addCandidate(candidates, { ...candidate, id: `TECH_DESIGN_SOURCE:${candidate.path}`, source: 'TECH_DESIGN_SOURCE' });
  }

  return [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export async function normalizeVisualContextFiles(workspaceRoot: string, files: unknown): Promise<string[]> {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const filePath of asStringArray(files)) {
    const absolutePath = assertInsideWorkspace(workspaceRoot, filePath);
    const relativePath = normalizePath(toRelativePath(workspaceRoot, absolutePath));
    if (!relativePath || seen.has(relativePath)) {
      continue;
    }
    if (!isVisualContextImagePath(relativePath)) {
      throw new Error(`视觉上下文仅支持图片文件: ${filePath}`);
    }
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error(`视觉上下文路径不是文件: ${filePath}`);
    }
    seen.add(relativePath);
    normalized.push(relativePath);
  }
  return normalized;
}

function visualContextPath(requirementId: string, selectedPaths: string[]): string {
  const id = normalizeRequirementId(requirementId);
  const fingerprint = hashContent(JSON.stringify({ selectedPaths })).slice(0, 16);
  return `docs/${id}/implementation/artifact-review/inputs/${fingerprint}-visual-context.md`;
}

function renderVisualContextMarkdown(input: {
  workflow: RequirementWorkflow;
  changeName: string;
  selectedPaths: string[];
  capturedAt: string;
}): string {
  return [
    '# OpenSpec 工件生成视觉上下文',
    '',
    `- 需求号: ${input.workflow.requirementId}`,
    `- 标题: ${input.workflow.title || '-'}`,
    `- OpenSpec 变更: ${input.changeName || '-'}`,
    `- 捕获时间: ${input.capturedAt}`,
    `- 图片数量: ${input.selectedPaths.length}`,
    '',
    '## 图片清单',
    '',
    ...input.selectedPaths.flatMap((filePath, index) => [
      `### ${index + 1}. ${path.basename(filePath)}`,
      '',
      `- 路径: ${filePath}`,
      '',
      `![${path.basename(filePath)}](${filePath})`,
      ''
    ])
  ].join('\n');
}

export async function prepareOpenSpecVisualContextAction(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  action: ActionInput,
  capturedAt: string
): Promise<{ action: ActionInput; snapshot?: OpenSpecVisualContextSnapshot }> {
  if (action.actionType !== 'OPENSPEC_FF') {
    return { action };
  }
  const params = action.params || {};
  const selectedPaths = await normalizeVisualContextFiles(workspaceRoot, params.visualContextFiles);
  if (!selectedPaths.length) {
    return {
      action: {
        ...action,
        params: {
          ...params,
          visualContextFiles: []
        }
      }
    };
  }
  const changeName = asString(params.changeName) || workflow.stages.IMPLEMENTATION.changeName || `req-${normalizeRequirementId(workflow.requirementId)}`;
  const content = renderVisualContextMarkdown({
    workflow,
    changeName,
    selectedPaths,
    capturedAt
  });
  const relativePath = visualContextPath(workflow.requirementId, selectedPaths);
  const absolutePath = assertInsideWorkspace(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
  const snapshot: OpenSpecVisualContextSnapshot = {
    contextPath: relativePath,
    selectedPaths,
    capturedAt
  };
  return {
    action: {
      ...action,
      params: {
        ...params,
        visualContextFiles: selectedPaths,
        openSpecVisualContextPath: relativePath
      }
    },
    snapshot
  };
}

export const internalForTests = {
  imageExtensions,
  visualContextPath,
  renderVisualContextMarkdown
};
