import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkflowProject } from '../../shared/workflow';
import { toAbsolutePath, toRelativePath } from './workspace';

export interface ResolvedWorkflowProject {
  project: WorkflowProject;
  rootPath: string;
  basePath?: string;
}

function normalizeAbsolutePath(filePath: string): string {
  return path.resolve(filePath);
}

export function isInsideDirectory(parent: string, child: string): boolean {
  const relative = path.relative(normalizeAbsolutePath(parent), normalizeAbsolutePath(child));
  return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function normalizeProjectBasePaths(projectPaths: string[] = []): string[] {
  return [...new Set(projectPaths.map((item) => item.trim()).filter(Boolean).map(normalizeAbsolutePath))];
}

function projectName(project: WorkflowProject): string {
  return (project.name || path.basename(project.path || '')).trim();
}

async function isDirectory(filePath: string): Promise<boolean> {
  const stat = await fs.stat(filePath).catch(() => null);
  return Boolean(stat?.isDirectory());
}

function assertAllowedProjectRoot(workspaceRoot: string, rootPath: string, projectPaths: string[]): void {
  const allowedRoots = [normalizeAbsolutePath(workspaceRoot), ...normalizeProjectBasePaths(projectPaths)];
  if (!allowedRoots.some((allowedRoot) => isInsideDirectory(allowedRoot, rootPath))) {
    throw new Error(`涉及工程不在已允许的工程目录内: ${rootPath}`);
  }
}

function findBasePath(rootPath: string, projectPaths: string[]): string | undefined {
  return normalizeProjectBasePaths(projectPaths).find((basePath) => isInsideDirectory(basePath, rootPath));
}

export function canonicalProjectPath(workspaceRoot: string, rootPath: string): string {
  const absoluteRoot = normalizeAbsolutePath(rootPath);
  if (isInsideDirectory(workspaceRoot, absoluteRoot)) {
    return toRelativePath(workspaceRoot, absoluteRoot).replace(/\\/g, '/');
  }
  return absoluteRoot;
}

export async function resolveWorkflowProject(
  workspaceRoot: string,
  project: WorkflowProject,
  projectPaths: string[] = []
): Promise<ResolvedWorkflowProject> {
  const rawPath = String(project.path || project.name || '').trim();
  const name = projectName(project);
  if (!rawPath && !name) {
    throw new Error('涉及工程路径不能为空');
  }

  const candidates: string[] = [];
  if (rawPath) {
    candidates.push(path.isAbsolute(rawPath) ? normalizeAbsolutePath(rawPath) : toAbsolutePath(workspaceRoot, rawPath));
  }
  if (name) {
    candidates.push(toAbsolutePath(workspaceRoot, name));
    for (const basePath of normalizeProjectBasePaths(projectPaths)) {
      candidates.push(path.join(basePath, name));
    }
  }

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (!(await isDirectory(candidate))) {
      continue;
    }
    assertAllowedProjectRoot(workspaceRoot, candidate, projectPaths);
    return {
      project: {
        name: name || path.basename(candidate),
        path: canonicalProjectPath(workspaceRoot, candidate)
      },
      rootPath: candidate,
      basePath: findBasePath(candidate, projectPaths)
    };
  }

  const displayName = name || rawPath;
  throw new Error(`涉及工程不存在或不是目录: ${displayName}`);
}

export async function normalizeWorkflowProjects(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  projectPaths: string[] = []
): Promise<WorkflowProject[]> {
  const seen = new Set<string>();
  const normalized: WorkflowProject[] = [];
  for (const project of projects) {
    const resolved = await resolveWorkflowProject(workspaceRoot, project, projectPaths);
    if (seen.has(resolved.rootPath)) {
      continue;
    }
    seen.add(resolved.rootPath);
    normalized.push(resolved.project);
  }
  return normalized;
}

export async function resolveWorkflowProjects(
  workspaceRoot: string,
  projects: WorkflowProject[] = [],
  projectPaths: string[] = []
): Promise<ResolvedWorkflowProject[]> {
  const resolved: ResolvedWorkflowProject[] = [];
  for (const project of projects) {
    resolved.push(await resolveWorkflowProject(workspaceRoot, project, projectPaths));
  }
  return resolved;
}

export function projectRootForDisplay(workspaceRoot: string, project: WorkflowProject): string {
  return path.isAbsolute(project.path) ? project.path : toAbsolutePath(workspaceRoot, project.path);
}
