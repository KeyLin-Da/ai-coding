import path from 'node:path';
import { isReportRunLogPath } from './artifact-path-rules';
import { localServiceError } from './local-errors';
import { assertInsideWorkspace, toRelativePath } from './workspace';

const BLOCKED_SEGMENTS = [
  '/workflow/',
  '/runs/',
  '/run-log/',
  '/prompts/',
  '/prompt/',
  '/scripts/',
  '/config/'
];

const PREVIEW_EXTENSIONS = new Set(['.md', '.markdown', '.html', '.htm', '.json', '.txt']);
const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']);

export interface ResolvedSharePath {
  relativePath: string;
  absolutePath: string;
}

export function normalizeShareArtifactPath(filePath: string): string {
  let normalized = String(filePath || '').trim().replace(/\\/g, '/');
  while (normalized.includes('//')) {
    normalized = normalized.replace(/\/{2,}/g, '/');
  }
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    normalized.includes('\0')
  ) {
    throw localServiceError('B70080', '分享产物路径不允许访问');
  }
  return normalized;
}

export function assertShareableArtifactPath(requirementId: string, filePath: string): string {
  const normalized = normalizeShareArtifactPath(filePath);
  const lower = normalized.toLowerCase();
  if (BLOCKED_SEGMENTS.some((segment) => lower.includes(segment)) || isReportRunLogPath(normalized, requirementId)) {
    throw localServiceError('B70080', '分享产物路径不允许访问');
  }

  const reqPrefix = `docs/${requirementId}/`;
  if (
    normalized.startsWith(`${reqPrefix}prd/`) ||
    normalized.startsWith(`${reqPrefix}technical-design/`) ||
    normalized.startsWith(`${reqPrefix}reports/`) ||
    normalized.startsWith(`${reqPrefix}junit/`) ||
    normalized.startsWith(`${reqPrefix}code-review/`) ||
    normalized.startsWith('docs/code_review/')
  ) {
    return normalized;
  }

  if (normalized.startsWith('openspec/changes/')) {
    if (
      lower.endsWith('/proposal.md') ||
      lower.endsWith('/design.md') ||
      lower.endsWith('/tasks.md') ||
      lower.includes('/specs/')
    ) {
      return normalized;
    }
  }

  throw localServiceError('B70080', '分享产物路径不允许访问');
}

export function assertPreviewableArtifactPath(requirementId: string, filePath: string): string {
  const normalized = assertShareableArtifactPath(requirementId, filePath);
  const ext = path.extname(normalized).toLowerCase();
  if (!PREVIEW_EXTENSIONS.has(ext)) {
    throw localServiceError('B70081', '分享产物当前不可读取');
  }
  return normalized;
}

export function resolvePublicAssetPath(requirementId: string, artifactPath: string, assetPath: string): string {
  const rawAssetPath = String(assetPath || '').trim();
  if (!rawAssetPath || /^[a-z][a-z0-9+.-]*:/i.test(rawAssetPath) || rawAssetPath.startsWith('//')) {
    throw localServiceError('B70080', '分享资源路径不允许访问');
  }
  const normalizedAssetPath = rawAssetPath.startsWith('/')
    ? rawAssetPath.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(path.posix.dirname(normalizeShareArtifactPath(artifactPath)), rawAssetPath));
  const normalized = assertShareableArtifactPath(requirementId, normalizedAssetPath);
  const ext = path.extname(normalized).toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) {
    throw localServiceError('B70080', '分享资源路径不允许访问');
  }
  return normalized;
}

export function resolveSharePathInWorkspace(workspaceRoot: string, filePath: string): ResolvedSharePath {
  const absolutePath = assertInsideWorkspace(workspaceRoot, filePath);
  return {
    absolutePath,
    relativePath: toRelativePath(workspaceRoot, absolutePath).replace(/\\/g, '/')
  };
}

export function isInsideWorkspacePath(workspaceRoot: string, absolutePath: string): boolean {
  const relative = path.relative(workspaceRoot, absolutePath);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative)) || relative === '';
}

export function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
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
  return mimeTypes[ext] || 'application/octet-stream';
}
