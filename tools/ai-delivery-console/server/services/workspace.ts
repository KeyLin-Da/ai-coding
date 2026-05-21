import crypto from 'node:crypto';
import path from 'node:path';

export function normalizeRequirementId(raw: string): string {
  const value = String(raw || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 50);
  if (!value) {
    throw new Error('需求号不能为空');
  }
  return value;
}

export function sanitizeBranchName(branchName = ''): string {
  return branchName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function toAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(workspaceRoot, filePath);
}

export function toRelativePath(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, toAbsolutePath(workspaceRoot, filePath));
}

export function assertInsideWorkspace(workspaceRoot: string, filePath: string): string {
  const absolute = toAbsolutePath(workspaceRoot, filePath);
  const relative = path.relative(workspaceRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`路径不在工作区内: ${filePath}`);
  }
  return absolute;
}

export function createId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

export function hashContent(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
