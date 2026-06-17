export interface CenterRequestContext {
  centerBaseUrl?: string;
  accessToken?: string;
  userId?: string | number;
  fetchImpl?: typeof fetch;
}

export type CenterRequestError = Error & {
  code?: string;
  data?: unknown;
  status?: number;
};

export function isCenterEndpointUnavailableError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as CenterRequestError).status === 404);
}

export function resolveCenterBaseUrl(context: CenterRequestContext): string {
  return (context.centerBaseUrl || process.env.VITE_AI_DELIVERY_CENTER_BASE_URL || 'http://127.0.0.1:8728').replace(/\/+$/, '');
}

export function centerAuthHeaders(context: CenterRequestContext): Record<string, string> {
  if (context.accessToken) {
    return { Authorization: `Bearer ${context.accessToken}` };
  }
  if (context.userId) {
    return { 'X-User-Id': String(context.userId) };
  }
  throw new Error('请先登录');
}

export async function centerRequest<T>(
  context: CenterRequestContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const fetcher = context.fetchImpl || fetch;
  const headers = {
    ...centerAuthHeaders(context),
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers || {})
  };
  const response = await fetcher(`${resolveCenterBaseUrl(context)}${path}`, {
    ...init,
    headers
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const error = new Error(body?.message || `中心服务请求失败: ${response.status}`) as CenterRequestError;
    error.code = body?.code;
    error.data = body?.data;
    error.status = response.status;
    throw error;
  }
  return (body?.data ?? body) as T;
}
