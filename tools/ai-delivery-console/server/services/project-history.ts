import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkflowProject } from '../../shared/workflow';
import { canonicalProjectPath } from './project-resolver';
import { readConsoleStateFile, writeConsoleStateFile } from './console-state';

interface ProjectHistoryFile {
  projects: Array<WorkflowProject & { lastUsedAt?: string }>;
}

async function readSavedProjectHistory(workspaceRoot: string): Promise<WorkflowProject[]> {
  try {
    const content = await readConsoleStateFile(workspaceRoot, 'project-history.json');
    if (!content.trim()) {
      return [];
    }
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

export async function readProjectHistory(workspaceRoot: string, projectPaths: string[] = []): Promise<WorkflowProject[]> {
  if (projectPaths.length) {
    return listProjectsFromConfiguredPaths(workspaceRoot, projectPaths);
  }
  await snapshotWorkspaceProjects(workspaceRoot);
  return readSavedProjectHistory(workspaceRoot);
}

export async function listProjectsFromConfiguredPaths(workspaceRoot: string, projectPaths: string[] = []): Promise<WorkflowProject[]> {
  const projects: WorkflowProject[] = [];
  
  for (const basePath of projectPaths) {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }
        // Check if it's a git repo
        const gitStat = await fs.stat(path.join(basePath, entry.name, '.git')).catch(() => null);
        if (gitStat) {
          const absolutePath = path.join(basePath, entry.name);
          projects.push({
            name: entry.name,
            path: canonicalProjectPath(workspaceRoot, absolutePath)
          });
        }
      }
    } catch (error: any) {
      // Directory doesn't exist or not accessible, skip silently
      console.log(`[project-list] 跳过不可访问的目录：${basePath}`, error.message);
    }
  }
  
  // Sort by path
  projects.sort((a, b) => a.path.localeCompare(b.path));
  return projects;
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
  await writeConsoleStateFile(workspaceRoot, 'project-history.json', `${JSON.stringify({ projects: [...merged.values()] }, null, 2)}\n`);
}
