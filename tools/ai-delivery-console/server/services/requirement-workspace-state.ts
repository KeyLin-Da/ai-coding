import type { RequirementWorkflow } from '../../shared/workflow';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';
import { inspectProjectRepository, resolveProjectRepoPath, runGit } from './project-repository';

export interface RequirementWorkspaceState {
  id?: number;
  projectId: number;
  requirementPk: number | string;
  userId: number | string;
  userDisplayName?: string;
  clientSessionId: number | string;
  status: 'CLEAN' | 'EDITING' | 'DIRTY' | 'SYNCING' | 'EXPIRED';
  dirtyFileCount: number;
  dirtyPathsSample: string[];
  headCommit?: string;
  remoteCommit?: string;
  firstDirtyAt?: string;
  lastReportedAt?: string;
  expireAt?: string;
}

interface ScheduledWorkspaceStateReport {
  lastStartedAt: number;
  inFlight?: Promise<void>;
}

export interface ScheduleRequirementWorkspaceStateReportOptions {
  now?: () => number;
  throttleMs?: number;
  reporter?: typeof reportRequirementWorkspaceState;
  logger?: Pick<Console, 'warn'>;
}

const DEFAULT_ASYNC_REPORT_THROTTLE_MS = 15_000;
const scheduledWorkspaceStateReports = new Map<string, ScheduledWorkspaceStateReport>();

function parsePorcelainPaths(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3);
      const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() || rawPath : rawPath;
      return filePath.replace(/\\/g, '/');
    });
}

function requirementPrefixes(workflow: RequirementWorkflow): string[] {
  const requirementId = workflow.requirementId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const changeName = workflow.stages.IMPLEMENTATION.changeName || `req-${requirementId}`;
  const codeReviewDir = workflow.branchName ? `docs/code_review/code_review_${workflow.branchName.replace(/[^a-zA-Z0-9_.-]/g, '_')}/` : '';
  return [
    `docs/${requirementId}/`,
    `openspec/changes/${changeName}/`,
    'openspec/specs/',
    codeReviewDir,
    `docs/${requirementId}/code-review/`
  ].filter(Boolean);
}

function matchesRequirementPath(workflow: RequirementWorkflow, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return requirementPrefixes(workflow).some((prefix) => normalized.startsWith(prefix));
}

function requireRequirementPk(workflow: RequirementWorkflow): string | number {
  if (!workflow.id) {
    throw new Error('缺少中心需求主键，无法检查需求协作占用');
  }
  return workflow.id;
}

export async function scanRequirementDirtyPaths(context: LocalRequestContext, workflow: RequirementWorkflow): Promise<string[]> {
  const { repoPath } = await resolveProjectRepoPath(context);
  const status = await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all']).catch(() => '');
  return parsePorcelainPaths(status)
    .filter((filePath) => matchesRequirementPath(workflow, filePath))
    .sort((left, right) => left.localeCompare(right));
}

export async function reportRequirementWorkspaceState(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  status?: RequirementWorkspaceState['status']
): Promise<RequirementWorkspaceState | undefined> {
  if (!workflow.id || !context.clientSessionId) {
    return undefined;
  }
  const repoState = await inspectProjectRepository(context).catch(() => undefined);
  const dirtyPaths = await scanRequirementDirtyPaths(context, workflow).catch(() => []);
  const nextStatus = status || (dirtyPaths.length ? 'DIRTY' : 'CLEAN');
  return centerRequest<RequirementWorkspaceState>(
    context,
    `/api/ai-delivery/requirements/${encodeURIComponent(String(workflow.id))}/workspace-states/report`,
    {
      method: 'POST',
      body: JSON.stringify({
        clientSessionId: Number(context.clientSessionId),
        status: nextStatus,
        dirtyFileCount: nextStatus === 'CLEAN' ? 0 : dirtyPaths.length,
        dirtyPathsSample: dirtyPaths.slice(0, 20),
        headCommit: repoState?.headCommit,
        remoteCommit: repoState?.remoteCommit
      })
    }
  );
}

function workspaceStateReportKey(context: LocalRequestContext, workflow: RequirementWorkflow): string {
  return [context.projectId || 'project', context.clientSessionId || 'session', workflow.id || workflow.requirementId].join(':');
}

export function scheduleRequirementWorkspaceStateReport(
  context: LocalRequestContext,
  workflow: RequirementWorkflow,
  options: ScheduleRequirementWorkspaceStateReportOptions = {}
): boolean {
  if (!workflow.id || !context.clientSessionId) {
    return false;
  }
  const now = options.now?.() ?? Date.now();
  const throttleMs = options.throttleMs ?? DEFAULT_ASYNC_REPORT_THROTTLE_MS;
  const key = workspaceStateReportKey(context, workflow);
  const scheduled = scheduledWorkspaceStateReports.get(key);
  if (scheduled?.inFlight) {
    return false;
  }
  if (scheduled && now - scheduled.lastStartedAt < throttleMs) {
    return false;
  }

  const reporter = options.reporter || reportRequirementWorkspaceState;
  const logger = options.logger || console;
  let inFlight: Promise<void>;
  inFlight = Promise.resolve()
    .then(() => reporter(context, workflow))
    .catch((error: Error) => {
      logger.warn?.('[ai-delivery] 异步上报需求工作区状态失败:', error.message || error);
    })
    .then(() => undefined)
    .finally(() => {
      const latest = scheduledWorkspaceStateReports.get(key);
      if (latest?.inFlight === inFlight) {
        scheduledWorkspaceStateReports.set(key, { lastStartedAt: latest.lastStartedAt });
      }
    });
  scheduledWorkspaceStateReports.set(key, { lastStartedAt: now, inFlight });
  return true;
}

export async function listRequirementWorkspaceStates(
  context: LocalRequestContext,
  workflow: RequirementWorkflow
): Promise<RequirementWorkspaceState[]> {
  const requirementPk = requireRequirementPk(workflow);
  return centerRequest<RequirementWorkspaceState[]>(
    context,
    `/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/workspace-states`
  );
}

export async function assertRequirementWorkspaceWritable(
  context: LocalRequestContext,
  workflow: RequirementWorkflow
): Promise<void> {
  const requirementPk = requireRequirementPk(workflow);
  await reportRequirementWorkspaceState(context, workflow).catch(() => undefined);
  await centerRequest<RequirementWorkspaceState[]>(
    context,
    `/api/ai-delivery/requirements/${encodeURIComponent(String(requirementPk))}/workspace-states/assert-writable`,
    {
      method: 'POST',
      body: JSON.stringify({
        clientSessionId: Number(context.clientSessionId || 0)
      })
    }
  );
}
