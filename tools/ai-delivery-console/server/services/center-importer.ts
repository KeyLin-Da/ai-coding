import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactRef, RequirementWorkflow, ReviewIssue, ReviewRecord, RunRecord } from '../../shared/workflow';
import { hashContent } from './workspace';
import { scanRequirementArtifacts } from './workspace-scanner';

export interface CenterImportArtifact {
  logicalPath: string;
  label: string;
  kind: ArtifactRef['kind'];
  stage: ArtifactRef['stage'];
  sha256: string;
  size: number;
  contentType: string;
  absolutePath: string;
}

export interface CenterImportRequirement {
  requirementId: string;
  title: string;
  requirementType: RequirementWorkflow['requirementType'];
  branchName?: string;
  currentStage: RequirementWorkflow['currentStage'];
  status: RequirementWorkflow['status'];
  stages: RequirementWorkflow['stages'];
  runs: RunRecord[];
  reviews: ReviewRecord[];
  issues: ReviewIssue[];
  artifacts: CenterImportArtifact[];
}

export interface CenterImportPlan {
  requirements: CenterImportRequirement[];
  skippedArtifacts: string[];
}

export interface CenterImportConfig {
  centerBaseUrl: string;
  userId: string | number;
  projectId: string | number;
  fetchImpl?: typeof fetch;
}

export async function buildCenterImportPlan(workspaceRoot: string, workflows: RequirementWorkflow[]): Promise<CenterImportPlan> {
  const skippedArtifacts: string[] = [];
  const requirements: CenterImportRequirement[] = [];
  for (const workflow of workflows) {
    const scannedArtifacts = await scanRequirementArtifacts(
      workspaceRoot,
      workflow.requirementId,
      workflow.branchName,
      workflow.stages.IMPLEMENTATION.changeName,
      workflow.requirementType
    );
    const artifacts: CenterImportArtifact[] = [];
    const seen = new Set<string>();
    for (const artifact of scannedArtifacts) {
      if (!artifact.exists || artifact.kind === 'directory' || seen.has(artifact.path)) {
        if (!artifact.exists) {
          skippedArtifacts.push(artifact.path);
        }
        continue;
      }
      seen.add(artifact.path);
      const absolutePath = path.join(workspaceRoot, artifact.path);
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat?.isFile()) {
        skippedArtifacts.push(artifact.path);
        continue;
      }
      const content = await fs.readFile(absolutePath);
      artifacts.push({
        logicalPath: artifact.path,
        label: artifact.label,
        kind: artifact.kind,
        stage: artifact.stage,
        sha256: hashContent(content),
        size: stat.size,
        contentType: contentTypeForPath(artifact.path),
        absolutePath
      });
    }
    requirements.push({
      requirementId: workflow.requirementId,
      title: workflow.title,
      requirementType: workflow.requirementType || 'REQUIREMENT',
      branchName: workflow.branchName,
      currentStage: workflow.currentStage,
      status: workflow.status,
      stages: workflow.stages,
      runs: workflow.runs,
      reviews: workflow.reviews,
      issues: workflow.issues,
      artifacts
    });
  }
  return { requirements, skippedArtifacts };
}

export function mapWorkflowToCenterRequirement(workflow: RequirementWorkflow, projectId: string | number) {
  return {
    projectId: Number(projectId),
    requirementId: workflow.requirementId,
    title: workflow.title,
    requirementType: workflow.requirementType || 'REQUIREMENT',
    branchName: workflow.branchName
  };
}

export async function importPlanToCenter(plan: CenterImportPlan, config: CenterImportConfig): Promise<{ importedArtifacts: number; skippedArtifacts: number }> {
  const fetcher = config.fetchImpl || fetch;
  let importedArtifacts = 0;
  for (const requirement of plan.requirements) {
    const centerRequirement = await postJson(
      fetcher,
      config,
      '/api/ai-delivery/requirements',
      mapWorkflowToCenterRequirement(requirement as unknown as RequirementWorkflow, config.projectId)
    );
    for (const artifact of requirement.artifacts) {
      const logicalArtifact = await postJson(fetcher, config, '/api/ai-delivery/artifacts', {
        requirementPk: centerRequirement.id,
        logicalPath: artifact.logicalPath,
        label: artifact.label,
        kind: artifact.kind,
        stage: artifact.stage
      });
      const session = await postJson(fetcher, config, '/api/ai-delivery/artifact-upload-sessions', {
        artifactId: logicalArtifact.id,
        baseVersionId: null,
        fileName: path.basename(artifact.logicalPath),
        sha256: artifact.sha256,
        size: artifact.size,
        contentType: artifact.contentType
      });
      if (session?.uploadUrl) {
        const file = await fs.readFile(artifact.absolutePath);
        const uploadResponse = await fetcher(session.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': artifact.contentType },
          body: file
        });
        if (!uploadResponse.ok) {
          throw new Error(`COS 上传失败: ${artifact.logicalPath}`);
        }
        await postJson(fetcher, config, '/api/ai-delivery/artifact-versions/complete', {
          uploadSessionId: session.uploadSessionId,
          baseVersionId: null
        });
        importedArtifacts++;
      }
    }
  }
  return {
    importedArtifacts,
    skippedArtifacts: plan.skippedArtifacts.length
  };
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.html') return 'text/html';
  if (ext === '.json') return 'application/json';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.pdf') return 'application/pdf';
  return 'text/plain';
}

async function postJson(fetcher: typeof fetch, config: CenterImportConfig, urlPath: string, payload: unknown): Promise<any> {
  const response = await fetcher(`${config.centerBaseUrl.replace(/\/+$/, '')}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(config.userId)
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || `中心服务导入失败: ${response.status}`);
  }
  return data?.data ?? data;
}
