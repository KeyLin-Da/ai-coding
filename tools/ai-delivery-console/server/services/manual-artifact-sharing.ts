import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactRef, RequirementWorkflow, RunRecord } from '../../shared/workflow';
import { hashContent } from './workspace';
import { scanRequirementArtifacts } from './workspace-scanner';

export interface ArtifactSnapshotEntry {
  path: string;
  hash: string;
  updatedAt?: string;
}

export interface ChangedControlledArtifact {
  artifact: ArtifactRef;
  absolutePath: string;
  sha256: string;
  size: number;
  contentType: string;
}

export type ArtifactSnapshot = Record<string, ArtifactSnapshotEntry>;

export async function captureControlledArtifactSnapshot(workspaceRoot: string, workflow: RequirementWorkflow): Promise<ArtifactSnapshot> {
  const artifacts = await scanShareableArtifacts(workspaceRoot, workflow);
  const snapshot: ArtifactSnapshot = {};
  for (const artifact of artifacts) {
    const absolutePath = path.join(workspaceRoot, artifact.path);
    const content = await fs.readFile(absolutePath).catch(() => undefined);
    if (!content) {
      continue;
    }
    snapshot[artifact.path] = {
      path: artifact.path,
      hash: hashContent(content),
      updatedAt: artifact.updatedAt
    };
  }
  return snapshot;
}

export async function detectChangedControlledArtifacts(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  before: ArtifactSnapshot
): Promise<ChangedControlledArtifact[]> {
  const artifacts = await scanShareableArtifacts(workspaceRoot, workflow);
  const changed: ChangedControlledArtifact[] = [];
  for (const artifact of artifacts) {
    const absolutePath = path.join(workspaceRoot, artifact.path);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      continue;
    }
    const content = await fs.readFile(absolutePath);
    const sha256 = hashContent(content);
    if (before[artifact.path]?.hash === sha256) {
      continue;
    }
    changed.push({
      artifact,
      absolutePath,
      sha256,
      size: stat.size,
      contentType: contentTypeForPath(artifact.path)
    });
  }
  return changed;
}

export async function buildArtifactPublishEvents(
  workspaceRoot: string,
  workflow: RequirementWorkflow,
  run: RunRecord,
  before: ArtifactSnapshot
) {
  const changed = await detectChangedControlledArtifacts(workspaceRoot, workflow, before);
  return changed.map((item) => ({
    type: 'ARTIFACT' as const,
    level: 'INFO' as const,
    message: `检测到可共享产物: ${item.artifact.path}`,
    data: {
      runId: run.id,
      logicalPath: item.artifact.path,
      label: item.artifact.label,
      kind: item.artifact.kind,
      stage: item.artifact.stage,
      sha256: item.sha256,
      size: item.size,
      contentType: item.contentType
    }
  }));
}

async function scanShareableArtifacts(workspaceRoot: string, workflow: RequirementWorkflow): Promise<ArtifactRef[]> {
  const artifacts = await scanRequirementArtifacts(
    workspaceRoot,
    workflow.requirementId,
    workflow.branchName,
    workflow.stages.IMPLEMENTATION.changeName,
    workflow.requirementType
  );
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    if (!artifact.exists || artifact.kind === 'directory' || seen.has(artifact.path)) {
      return false;
    }
    seen.add(artifact.path);
    return isShareableControlledArtifact(workflow, artifact.path);
  });
}

export function isShareableControlledArtifact(workflow: RequirementWorkflow, relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const requirementId = workflow.requirementId.replace(/[^a-zA-Z0-9_-]/g, '');
  const changeName = workflow.stages.IMPLEMENTATION.changeName || `req-${requirementId}`;
  const prefixes = [
    `docs/${requirementId}/prd/`,
    `docs/${requirementId}/technical-design/`,
    `docs/${requirementId}/reports/`,
    `docs/${requirementId}/junit/`,
    `docs/${requirementId}/code-review/`,
    `openspec/changes/${changeName}/`,
    'docs/code_review/'
  ];
  if (!prefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  if (normalized.includes('/workflow/')) {
    return false;
  }
  return /\.(md|markdown|html|json|txt|log)$/i.test(normalized);
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.html') return 'text/html';
  if (ext === '.json') return 'application/json';
  if (ext === '.log' || ext === '.txt') return 'text/plain';
  return 'text/plain';
}
