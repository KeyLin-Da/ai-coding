import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkflowProject } from '../../shared/workflow';
import { assertInsideWorkspace, toRelativePath } from './workspace';

interface ProjectHistoryFile {
  projects: Array<WorkflowProject & { lastUsedAt?: string }>;
}

function historyPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'docs', '.ai-delivery-console', 'project-history.json');
}

function normalizeProjectPath(workspaceRoot: string, rawPath: string): string {
  const value = String(rawPath || '').trim();
  if (!value) {
    throw new Error('涉及工程路径不能为空');
  }
  const absolute = assertInsideWorkspace(workspaceRoot, value);
  const relative = toRelativePath(workspaceRoot, absolute).replace(/\\/g, '/');
  if (!relative || relative === '.') {
    throw new Error('涉及工程不能为工作区根目录');
  }
  return relative;
}

async function assertProjectDirectory(workspaceRoot: string, relativePath: string): Promise<void> {
  const absolute = assertInsideWorkspace(workspaceRoot, relativePath);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`涉及工程不存在或不是目录: ${relativePath}`);
  }
}

async function readSavedProjectHistory(workspaceRoot: string): Promise<WorkflowProject[]> {
  try {
    const content = await fs.readFile(historyPath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(content) as ProjectHistoryFile;
    return (parsed.projects || []).map((project) => ({
      name: project.name || path.basename(project.path),
      path: project.path
    }));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function snapshotWorkspaceProjects(workspaceRoot: string): Promise<WorkflowProject[]> {
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const projects: WorkflowProject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    const relativePath = entry.name;
    const gitStat = await fs.stat(path.join(workspaceRoot, relativePath, '.git')).catch(() => null);
    if (gitStat) {
      projects.push({
        name: entry.name,
        path: relativePath
      });
    }
  }
  projects.sort((a, b) => a.path.localeCompare(b.path));
  await saveProjectHistory(workspaceRoot, projects);
  return projects;
}

export async function normalizeWorkflowProjects(workspaceRoot: string, projects: WorkflowProject[] = []): Promise<WorkflowProject[]> {
  const seen = new Set<string>();
  const normalized: WorkflowProject[] = [];
  for (const project of projects) {
    const projectPath = normalizeProjectPath(workspaceRoot, project.path || project.name);
    if (seen.has(projectPath)) {
      continue;
    }
    await assertProjectDirectory(workspaceRoot, projectPath);
    seen.add(projectPath);
    normalized.push({
      name: project.name?.trim() || path.basename(projectPath),
      path: projectPath
    });
  }
  return normalized;
}

export async function readProjectHistory(workspaceRoot: string): Promise<WorkflowProject[]> {
  await snapshotWorkspaceProjects(workspaceRoot);
  return readSavedProjectHistory(workspaceRoot);
}

export async function saveProjectHistory(workspaceRoot: string, projects: WorkflowProject[]): Promise<void> {
  if (!projects.length) {
    return;
  }
  const now = new Date().toISOString();
  const existing = await readSavedProjectHistory(workspaceRoot);
  const merged = new Map<string, WorkflowProject & { lastUsedAt: string }>();
  for (const project of existing) {
    merged.set(project.path, { ...project, lastUsedAt: now });
  }
  for (const project of projects) {
    merged.set(project.path, { ...project, lastUsedAt: now });
  }
  const filePath = historyPath(workspaceRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ projects: [...merged.values()] }, null, 2)}\n`, 'utf8');
}
