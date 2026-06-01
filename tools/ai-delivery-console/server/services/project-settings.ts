import fs from 'node:fs/promises';
import path from 'node:path';

export interface ProjectSettings {
  projectPaths: string[];
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

function normalizeProjectPaths(projectPaths: unknown[]): string[] {
  return [...new Set(projectPaths.map((item) => (typeof item === 'string' ? path.resolve(item.trim()) : '')).filter(Boolean))];
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
