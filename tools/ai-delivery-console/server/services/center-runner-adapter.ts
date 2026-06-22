import type { ActionInput, RequirementWorkflow, RunEvent } from '../../shared/workflow';
import { validateActionInput } from './action-adapters';

export interface CenterRunnerConfig {
  centerBaseUrl: string;
  userId?: string | number;
  clientSessionId: string | number;
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export interface CenterJobCreatePayload {
  requirementPk: number;
  actionType: ActionInput['actionType'];
  paramsJson: string;
}

export interface CenterJobVO {
  id: number;
  requirementPk: number;
  actionType: string;
  status: string;
  runId?: number;
}

export interface CenterRunEventPayload {
  runId: number;
  seq?: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  type: 'stdout' | 'stderr' | 'exit' | 'cancelled';
  message: string;
  payloadJson?: string;
}

export interface CenterRunTokenUsagePayload {
  runId: number;
  seq?: number;
  stage?: string;
  implementationStep?: string;
  agentId?: string;
  model?: string;
  sourceEventType: string;
  usageFingerprint?: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
  };
  rawUsageJson?: string;
  occurredAt?: string;
}

export function buildCenterJobCreatePayload(workflow: RequirementWorkflow, action: ActionInput, localRunId?: string): CenterJobCreatePayload {
  validateActionInput('', action, { skipPathValidation: true });
  const requirementPk = Number(action.params?.requirementPk || action.params?.requirementIdPk || workflow.id || 0);
  if (!Number.isFinite(requirementPk) || requirementPk <= 0) {
    throw new Error('缺少中心服务 requirementPk，无法创建远程 Job');
  }
  return {
    requirementPk,
    actionType: action.actionType,
    paramsJson: JSON.stringify({
      requirementId: workflow.requirementId,
      title: workflow.title,
      ...(localRunId ? { localRunId } : {}),
      ...(action.params || {})
    })
  };
}

export function mapRunEventToCenter(runId: number, event: RunEvent, seq?: number): CenterRunEventPayload {
  return {
    runId,
    seq,
    level: event.level,
    type: mapRunEventType(event.type),
    message: event.text || event.message || '',
    payloadJson: event.data === undefined ? undefined : JSON.stringify(event.data)
  };
}

export async function createCenterJob(config: CenterRunnerConfig, payload: CenterJobCreatePayload): Promise<CenterJobVO> {
  return postJson(config, '/api/ai-delivery/jobs', payload) as Promise<CenterJobVO>;
}

export async function claimCenterJob(config: CenterRunnerConfig, jobId: number): Promise<CenterJobVO> {
  return postJson(config, `/api/ai-delivery/jobs/${jobId}/claim`, {
    clientSessionId: Number(config.clientSessionId),
    capabilities: ['ALL']
  }) as Promise<CenterJobVO>;
}

export async function renewCenterJob(config: CenterRunnerConfig, jobId: number): Promise<CenterJobVO> {
  return postJson(config, `/api/ai-delivery/jobs/${jobId}/renew`, {
    clientSessionId: Number(config.clientSessionId)
  }) as Promise<CenterJobVO>;
}

export async function uploadCenterRunEvent(config: CenterRunnerConfig, payload: CenterRunEventPayload): Promise<unknown> {
  return postJson(config, '/api/ai-delivery/run-events', payload);
}

export async function uploadCenterRunTokenUsage(config: CenterRunnerConfig, payload: CenterRunTokenUsagePayload): Promise<unknown> {
  return postJson(config, '/api/ai-delivery/run-token-usages', payload);
}

export async function completeCenterJob(config: CenterRunnerConfig, jobId: number): Promise<unknown> {
  return postJson(config, `/api/ai-delivery/jobs/${jobId}/complete`, {
    clientSessionId: Number(config.clientSessionId)
  });
}

export async function failCenterJob(config: CenterRunnerConfig, jobId: number, errorMessage: string): Promise<unknown> {
  return postJson(config, `/api/ai-delivery/jobs/${jobId}/fail`, {
    clientSessionId: Number(config.clientSessionId),
    errorMessage
  });
}

export async function cancelCenterJob(config: CenterRunnerConfig, jobId: number): Promise<unknown> {
  return postJson(config, `/api/ai-delivery/jobs/${jobId}/cancel`, {});
}

function mapRunEventType(type: RunEvent['type']): CenterRunEventPayload['type'] {
  switch (type) {
    case 'STDERR':
    case 'WARN':
    case 'ERROR':
      return 'stderr';
    case 'EXIT':
      return 'exit';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'stdout';
  }
}

async function postJson(config: CenterRunnerConfig, path: string, payload: unknown): Promise<unknown> {
  const fetcher = config.fetchImpl || fetch;
  const baseUrl = config.centerBaseUrl.replace(/\/+$/, '');
  const response = await fetcher(`${baseUrl}${path}`, {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || `中心服务请求失败: ${response.status}`);
  }
  return data?.data ?? data;
}

function authHeaders(config: CenterRunnerConfig): Record<string, string> {
  if (!config.accessToken && !config.userId) {
    throw new Error('缺少登录态 accessToken 或迁移期 userId');
  }
  return {
    'Content-Type': 'application/json',
    ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : { 'X-User-Id': String(config.userId) })
  };
}
