import type { RequirementType, RequirementWorkflow, StageState, WorkflowProject, WorkflowStage, WorkflowStatus } from '../../shared/workflow';
import { createEmptyStages, defaultBranchName, ensureImplementationSteps, workflowStages } from '../../shared/workflow';
import { deriveCurrentStage } from '../../shared/stage-rules';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';

const CENTER_REQUIREMENT_CACHE_TTL_MS = 5_000;

interface CenterRequirementCacheEntry {
  expiresAt: number;
  value?: RequirementWorkflow | null;
  inFlight?: Promise<RequirementWorkflow | null>;
}

export interface CachedCenterRequirementOptions {
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

const centerRequirementCache = new Map<string, CenterRequirementCacheEntry>();

interface CenterWorkflowStagePayload {
  stage: WorkflowStage | 'DONE';
  status: WorkflowStatus;
  artifactId?: string | number;
  approvedAt?: string;
  rejectedAt?: string;
  comment?: string;
}

export interface CenterRequirementPayload {
  id: string | number;
  projectId?: string | number;
  requirementId: string;
  title: string;
  requirementType?: RequirementType;
  branchName?: string;
  status: WorkflowStatus;
  currentStage: WorkflowStage | 'DONE';
  stages?: CenterWorkflowStagePayload[];
  projectNames?: string[];
  onlineClientCount?: number;
  pendingReviewCount?: number;
  jobStatus?: string;
  lastEventId?: string | number;
}

function requireProjectId(context: LocalRequestContext): string {
  const projectId = String(context.projectId || '').trim();
  if (!projectId) {
    throw new Error('缺少中心服务 projectId');
  }
  return projectId;
}

function centerProjectNamesToWorkflowProjects(projectNames?: string[]): WorkflowProject[] {
  return (projectNames || []).map((name) => ({ name, path: name }));
}

export function centerRequirementToWorkflow(item: CenterRequirementPayload): RequirementWorkflow {
  const requirementType = item.requirementType || 'REQUIREMENT';
  const stages = createEmptyStages(requirementType);
  for (const stage of item.stages || []) {
    if (stage.stage && stage.stage !== 'DONE' && stages[stage.stage]) {
      stages[stage.stage] = {
        stage: stage.stage,
        status: stage.status,
        artifactPath: stage.artifactId == null ? undefined : String(stage.artifactId),
        approvedAt: stage.approvedAt,
        rejectedAt: stage.rejectedAt,
        comment: stage.comment
      };
    }
  }
  const now = new Date().toISOString();
  return {
    id: item.id,
    requirementId: item.requirementId,
    title: item.title,
    requirementType,
    branchName: item.branchName || defaultBranchName(item.requirementId, requirementType),
    projects: centerProjectNamesToWorkflowProjects(item.projectNames),
    sources: [],
    currentStage: item.currentStage,
    status: item.status,
    createdAt: now,
    updatedAt: now,
    stages,
    implementationSteps: ensureImplementationSteps(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: [],
    onlineClientCount: item.onlineClientCount,
    pendingReviewCount: item.pendingReviewCount,
    jobStatus: item.jobStatus,
    lastEventId: item.lastEventId
  };
}

function mergeStage(local: StageState | undefined, center: StageState): StageState {
  return {
    ...local,
    ...center,
    artifactPath: local?.artifactPath || center.artifactPath,
    changeName: local?.changeName || center.changeName,
    runId: local?.runId || center.runId
  };
}

export function mergeRequirementWorkflow(centerWorkflow: RequirementWorkflow, localWorkflow?: RequirementWorkflow | null): RequirementWorkflow {
  if (!localWorkflow) {
    return centerWorkflow;
  }
  const stages = { ...centerWorkflow.stages };
  for (const stage of workflowStages) {
    stages[stage] = mergeStage(localWorkflow.stages?.[stage], centerWorkflow.stages[stage]);
  }
  const merged: RequirementWorkflow = {
    ...localWorkflow,
    id: centerWorkflow.id,
    requirementId: centerWorkflow.requirementId,
    title: centerWorkflow.title,
    requirementType: centerWorkflow.requirementType,
    branchName: centerWorkflow.branchName || localWorkflow.branchName,
    projects: localWorkflow.projects?.length ? localWorkflow.projects : centerWorkflow.projects,
    currentStage: centerWorkflow.currentStage,
    status: centerWorkflow.status,
    stages,
    implementationSteps: ensureImplementationSteps(localWorkflow.implementationSteps),
    onlineClientCount: centerWorkflow.onlineClientCount,
    pendingReviewCount: centerWorkflow.pendingReviewCount,
    jobStatus: centerWorkflow.jobStatus,
    lastEventId: centerWorkflow.lastEventId
  };
  return {
    ...merged,
    currentStage: deriveCurrentStage(merged)
  };
}

export async function listCenterRequirementWorkflows(context: LocalRequestContext): Promise<RequirementWorkflow[]> {
  const projectId = requireProjectId(context);
  const items = await centerRequest<CenterRequirementPayload[]>(
    context,
    `/api/ai-delivery/requirements?projectId=${encodeURIComponent(projectId)}`
  );
  return items.map(centerRequirementToWorkflow);
}

export async function loadCenterRequirementWorkflow(context: LocalRequestContext, requirementId: string): Promise<RequirementWorkflow | null> {
  const projectId = requireProjectId(context);
  try {
    const item = await centerRequest<CenterRequirementPayload>(
      context,
      `/api/ai-delivery/requirements/${encodeURIComponent(requirementId)}?projectId=${encodeURIComponent(projectId)}`
    );
    return centerRequirementToWorkflow(item);
  } catch (error: any) {
    if (/不存在|404/.test(error.message || '')) {
      return null;
    }
    throw error;
  }
}

export async function loadCachedCenterRequirementWorkflow(
  context: LocalRequestContext,
  requirementId: string,
  options: CachedCenterRequirementOptions = {}
): Promise<RequirementWorkflow | null | undefined> {
  const now = options.now?.() ?? Date.now();
  const cacheTtlMs = options.cacheTtlMs ?? CENTER_REQUIREMENT_CACHE_TTL_MS;
  const key = centerRequirementCacheKey(context, requirementId);
  const cached = centerRequirementCache.get(key);
  if (cached && cached.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  let inFlight = cached?.inFlight;
  if (!inFlight) {
    inFlight = loadCenterRequirementWorkflow(context, requirementId)
      .then((value) => {
        centerRequirementCache.set(key, {
          value,
          expiresAt: (options.now?.() ?? Date.now()) + cacheTtlMs
        });
        return value;
      })
      .catch((error) => {
        if (!cached?.value) {
          centerRequirementCache.delete(key);
        }
        throw error;
      })
      .finally(() => {
        const latest = centerRequirementCache.get(key);
        if (latest?.inFlight === inFlight) {
          if (latest.value !== undefined) {
            centerRequirementCache.set(key, {
              value: latest.value,
              expiresAt: latest.expiresAt
            });
          } else {
            centerRequirementCache.delete(key);
          }
        }
      });
    centerRequirementCache.set(key, {
      value: cached?.value,
      expiresAt: cached?.expiresAt || 0,
      inFlight
    });
  }

  if (options.timeoutMs == null) {
    return inFlight;
  }

  const timeout = Symbol('center-requirement-timeout');
  const result = await Promise.race([
    inFlight,
    new Promise<typeof timeout>((resolve) => {
      setTimeout(() => resolve(timeout), options.timeoutMs);
    })
  ]);
  return result === timeout ? cached?.value : result;
}

export function clearCenterRequirementWorkflowCache(): void {
  centerRequirementCache.clear();
}

function centerRequirementCacheKey(context: LocalRequestContext, requirementId: string): string {
  return [
    context.centerBaseUrl || '',
    context.userId || '',
    context.projectId || '',
    requirementId
  ].join(':');
}
