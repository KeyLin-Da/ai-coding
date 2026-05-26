import fs from 'node:fs/promises';
import path from 'node:path';
import type { PrdSourceFile, RequirementWorkflow } from '../../shared/workflow';
import { assertInsideWorkspace, createId, normalizeRequirementId, toRelativePath } from './workspace';

export interface UploadedPrdSourceFile {
  filename: string;
  mimeType?: string;
  content: Buffer;
}

const allowedExtensions = new Set(['.pdf', '.md', '.markdown', '.png', '.jpg', '.jpeg', '.gif', '.webp']);
const maxFileSize = 20 * 1024 * 1024;

function safeFileName(filename: string): string {
  const parsed = path.parse(filename || 'prd-source');
  const ext = parsed.ext.toLowerCase();
  const name = parsed.name.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_').slice(0, 80) || 'prd-source';
  return `${name}${ext}`;
}

export function assertAllowedPrdSourceFile(file: UploadedPrdSourceFile): void {
  const ext = path.extname(file.filename || '').toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error('仅支持上传 PDF、图片或 Markdown 文件');
  }
  if (!file.content.length) {
    throw new Error('上传文件不能为空');
  }
  if (file.content.length > maxFileSize) {
    throw new Error('单个 PRD 来源文件不能超过 20MB');
  }
}

export function getPrdSourceFileDir(workspaceRoot: string, requirementId: string): string {
  return path.join(workspaceRoot, 'docs', normalizeRequirementId(requirementId), 'workflow', 'file');
}

export async function savePrdSourceFileSnapshot(
  workspaceRoot: string,
  requirementId: string,
  file: UploadedPrdSourceFile
): Promise<PrdSourceFile> {
  assertAllowedPrdSourceFile(file);
  const id = createId('file');
  const filename = `${id}-${safeFileName(file.filename)}`;
  const fileDir = getPrdSourceFileDir(workspaceRoot, requirementId);
  await fs.mkdir(fileDir, { recursive: true });
  const absolutePath = path.join(fileDir, filename);
  await fs.writeFile(absolutePath, file.content);
  return {
    id,
    name: file.filename,
    path: toRelativePath(workspaceRoot, absolutePath),
    size: file.content.length,
    mimeType: file.mimeType,
    uploadedAt: new Date().toISOString()
  };
}

export async function deletePrdSourceFileSnapshot(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  fileId: string
): Promise<RequirementWorkflow> {
  const file = workflow.prdSourceFiles?.find((item) => item.id === fileId);
  if (!file) {
    throw new Error('PRD 来源文件不存在');
  }
  const absolutePath = assertInsideWorkspace(workspaceRoot, file.path);
  const allowedDir = getPrdSourceFileDir(workspaceRoot, workflow.requirementId);
  const relativeToDir = path.relative(allowedDir, absolutePath);
  if (relativeToDir.startsWith('..') || path.isAbsolute(relativeToDir)) {
    throw new Error('PRD 来源文件路径异常');
  }
  await fs.rm(absolutePath, { force: true });
  return {
    ...workflow,
    prdSourceFiles: workflow.prdSourceFiles?.filter((item) => item.id !== fileId) || [],
    sources: workflow.sources.filter((source) => source !== file.path)
  };
}
