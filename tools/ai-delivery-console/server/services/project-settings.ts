import fs from 'node:fs/promises';
import path from 'node:path';

export interface ProjectSettings {
  projectPaths: string[];
}

export interface ProjectSettingsLookupContext {
  centerBaseUrl?: string;
  projectId?: string | number;
  accessToken?: string;
  userId?: string | number;
  fetchImpl?: typeof fetch;
}

interface WorkspaceMappingPayload {
  localPath?: string;
  status?: string;
}

function settingsFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'docs/.ai-delivery-console', 'settings.json');
}

export async function loadSettings(workspaceRoot: string): Promise<ProjectSettings> {
  const raw = await fs.readFile(settingsFilePath(workspaceRoot), 'utf8').catch(() => '');
  if (!raw.trim()) {
    return { projectPaths: [] };
  }
  const parsed = JSON.parse(raw) as Partial<ProjectSettings>;
  return { projectPaths: Array.isArray(parsed.projectPaths) ? normalizeProjectPaths(parsed.projectPaths) : [] };
}

export async function saveSettings(workspaceRoot: string, settings: ProjectSettings): Promise<ProjectSettings> {
  const normalized = { projectPaths: normalizeProjectPaths(settings.projectPaths) };
  const filePath = settingsFilePath(workspaceRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export function normalizeProjectPaths(projectPaths: unknown[]): string[] {
  return [...new Set(projectPaths.map((item) => (typeof item === 'string' ? path.resolve(item.trim()) : '')).filter(Boolean))];
}

export async function loadPrivateProjectSettings(context: ProjectSettingsLookupContext): Promise<ProjectSettings> {
  const projectId = String(context.projectId || '').trim();
  if (!projectId) {
    throw new Error('请先选择项目，再使用本地工程目录');
  }
  const headers = authHeaders(context);
  const fetcher = context.fetchImpl || fetch;
  const baseUrl = (context.centerBaseUrl || process.env.AI_DELIVERY_CENTER_BASE_URL || 'http://127.0.0.1:8728').replace(/\/+$/, '');
  const response = await fetcher(`${baseUrl}/api/ai-delivery/projects/${encodeURIComponent(projectId)}/workspace-mappings`, {
    method: 'GET',
    headers
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || `读取当前项目私有工程目录失败: ${response.status}`);
  }
  const mappings = Array.isArray(body?.data) ? (body.data as WorkspaceMappingPayload[]) : Array.isArray(body) ? (body as WorkspaceMappingPayload[]) : [];
  return {
    projectPaths: normalizeProjectPaths(
      mappings.filter((item) => !item.status || item.status === 'ACTIVE').map((item) => item.localPath || '')
    )
  };
}

export function assertProjectPathsConfigured(settings: ProjectSettings): void {
  if (!settings.projectPaths.length) {
    throw new Error('请先在个人中心为当前项目配置工程目录');
  }
}

function authHeaders(context: ProjectSettingsLookupContext): Record<string, string> {
  if (context.accessToken) {
    return { Authorization: `Bearer ${context.accessToken}` };
  }
  if (context.userId) {
    return { 'X-User-Id': String(context.userId) };
  }
  throw new Error('请先登录，再使用本地工程目录');
}

export function validateSettings(settings: ProjectSettings): string | undefined {
  if (!Array.isArray(settings.projectPaths)) {
    return 'projectPaths 必须是数组';
  }
  if (!settings.projectPaths.length) {
    return '至少配置一个工程父目录';
  }
  for (const p of settings.projectPaths) {
    if (typeof p !== 'string' || !p.trim()) {
      return '路径不能为空';
    }
    if (!path.isAbsolute(p)) {
      return `路径必须为绝对路径：${p}`;
    }
  }
  return undefined;
}
