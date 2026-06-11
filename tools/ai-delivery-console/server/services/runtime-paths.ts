import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { WorkflowStage } from '../../shared/workflow';
import { assertInsideWorkspace, normalizeRequirementId } from './workspace';

const RUNTIME_REF_PREFIX = '.ai-delivery-runtime';

function safeRuntimeProjectKey(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  const name = path.basename(resolved).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60) || 'workspace';
  const hash = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 8);
  return `${name}-${hash}`;
}

export function runnerRuntimeRefPrefix(): string {
  return RUNTIME_REF_PREFIX;
}

export function getRunnerPrivateRoot(workspaceRoot: string): string {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  return process.env.AI_DELIVERY_PRIVATE_ROOT
    ? path.resolve(process.env.AI_DELIVERY_PRIVATE_ROOT)
    : path.join(path.dirname(resolvedWorkspaceRoot), '.ai-delivery');
}

export function getRunnerRuntimeRoot(workspaceRoot: string): string {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const baseRoot = process.env.AI_DELIVERY_RUNTIME_ROOT
    ? path.resolve(process.env.AI_DELIVERY_RUNTIME_ROOT)
    : path.join(getRunnerPrivateRoot(resolvedWorkspaceRoot), 'runtime');
  return path.join(baseRoot, safeRuntimeProjectKey(resolvedWorkspaceRoot));
}

export function getConsoleStateDir(workspaceRoot: string): string {
  return path.join(getRunnerPrivateRoot(workspaceRoot), 'console', safeRuntimeProjectKey(workspaceRoot));
}

export function getRequirementRuntimeDir(workspaceRoot: string, requirementId: string): string {
  return path.join(getRunnerRuntimeRoot(workspaceRoot), 'requirements', normalizeRequirementId(requirementId));
}

export function getWorkflowRuntimeDir(workspaceRoot: string, requirementId: string): string {
  return path.join(getRequirementRuntimeDir(workspaceRoot, requirementId), 'workflow');
}

export function getWorkflowRuntimeStatePath(workspaceRoot: string, requirementId: string): string {
  return path.join(getWorkflowRuntimeDir(workspaceRoot, requirementId), 'state.json');
}

export function getRunRuntimeDir(workspaceRoot: string, requirementId: string): string {
  return path.join(getRequirementRuntimeDir(workspaceRoot, requirementId), 'runs');
}

export function getPromptRuntimeDir(workspaceRoot: string, requirementId: string): string {
  return path.join(getRequirementRuntimeDir(workspaceRoot, requirementId), 'prompts');
}

export function getScriptRuntimeDir(workspaceRoot: string, requirementId: string): string {
  return path.join(getRequirementRuntimeDir(workspaceRoot, requirementId), 'scripts');
}

export function getStageLogRuntimeDir(workspaceRoot: string, requirementId: string, stage: WorkflowStage): string {
  const stageMap: Record<WorkflowStage, string> = {
    PRD: 'prd',
    TECH_DESIGN: 'tech-design',
    IMPLEMENTATION: 'implementation',
    CODE_REVIEW: 'code-review'
  };
  return path.join(getRequirementRuntimeDir(workspaceRoot, requirementId), 'logs', stageMap[stage]);
}

function assertInsideRuntimeRoot(workspaceRoot: string, filePath: string): string {
  const root = getRunnerRuntimeRoot(workspaceRoot);
  const absolute = path.resolve(filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`路径不在运行目录内: ${filePath}`);
  }
  return absolute;
}

export function toRuntimePathRef(workspaceRoot: string, absolutePath: string): string {
  const root = getRunnerRuntimeRoot(workspaceRoot);
  const relative = path.relative(root, path.resolve(absolutePath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`路径不在运行目录内: ${absolutePath}`);
  }
  return `${RUNTIME_REF_PREFIX}/${relative.replace(/\\/g, '/')}`;
}

export function resolveWorkspaceOrRuntimePath(workspaceRoot: string, filePath: string): string {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (normalized === RUNTIME_REF_PREFIX || normalized.startsWith(`${RUNTIME_REF_PREFIX}/`)) {
    const relative = normalized.slice(RUNTIME_REF_PREFIX.length).replace(/^\/+/, '');
    if (!relative || relative.includes('../')) {
      throw new Error(`运行目录路径不合法: ${filePath}`);
    }
    return assertInsideRuntimeRoot(workspaceRoot, path.join(getRunnerRuntimeRoot(workspaceRoot), relative));
  }
  return assertInsideWorkspace(workspaceRoot, filePath);
}

export async function listRuntimeRequirementIds(workspaceRoot: string): Promise<string[]> {
  const root = path.join(getRunnerRuntimeRoot(workspaceRoot), 'requirements');
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => normalizeRequirementId(entry.name));
}
