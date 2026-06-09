export interface CenterRequestContext {
  centerBaseUrl?: string;
  accessToken?: string;
  userId?: string | number;
  fetchImpl?: typeof fetch;
}

export function resolveCenterBaseUrl(context: CenterRequestContext): string {
  return (context.centerBaseUrl || process.env.AI_DELIVERY_CENTER_BASE_URL || 'http://127.0.0.1:8728').replace(/\/+$/, '');
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
    const error = new Error(body?.message || `中心服务请求失败: ${response.status}`) as Error & { code?: string; data?: unknown };
    error.code = body?.code;
    error.data = body?.data;
    throw error;
  }
  return (body?.data ?? body) as T;
}
