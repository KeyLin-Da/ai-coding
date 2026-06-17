interface ApiRuntimeConfig {
  centerBaseUrl: string;
  runnerBaseUrl: string;
  accessToken: string;
  userId: string;
  clientSessionId: string;
  projectId: string;
}

function envValue(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

export function apiRuntimeEnvDefaults() {
  return {
    centerBaseUrl: envValue(import.meta.env.VITE_AI_DELIVERY_CENTER_BASE_URL, 'http://127.0.0.1:8728'),
    runnerBaseUrl: envValue(import.meta.env.VITE_AI_DELIVERY_RUNNER_BASE_URL, 'http://127.0.0.1:8718')
  };
}

const envDefaults = apiRuntimeEnvDefaults();

let runtimeConfig: ApiRuntimeConfig = {
  centerBaseUrl: envDefaults.centerBaseUrl,
  runnerBaseUrl: envDefaults.runnerBaseUrl,
  accessToken: '',
  userId: '',
  clientSessionId: '',
  projectId: ''
};

export function setApiRuntimeConfig(config: Partial<ApiRuntimeConfig>) {
  runtimeConfig = {
    ...runtimeConfig,
    ...config
  };
}

export function getApiRuntimeConfig(): ApiRuntimeConfig {
  return { ...runtimeConfig };
}

/**
 * 检测隧道模式：页面不在 localhost 上，但 API 地址指向 localhost。
 * 这意味着用户通过内网穿透（如 cloudflared）访问，浏览器无法直接请求 127.0.0.1。
 */
function isTunnelMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const { hostname } = window.location;
  const isLocalPage = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '';
  if (isLocalPage) {
    return false;
  }
  const centerIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(runtimeConfig.centerBaseUrl);
  const runnerIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(runtimeConfig.runnerBaseUrl);
  return centerIsLocal || runnerIsLocal;
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (isTunnelMode()) {
    // 隧道模式：使用 /center-api/ 前缀，由 Vite proxy 转发到 center (8728)
    return `/center-api${path}`;
  }
  return `${runtimeConfig.centerBaseUrl.replace(/\/+$/, '')}${path}`;
}

export function resolveRunnerApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (isTunnelMode()) {
    // 隧道模式：使用相对路径，由 Vite proxy /api → runner (8718)
    return path;
  }
  return `${runtimeConfig.runnerBaseUrl.replace(/\/+$/, '')}${path}`;
}

export function resolveWebSocketUrl(path: string, protocol = window.location.protocol): string {
  if (/^wss?:\/\//.test(path)) {
    return path;
  }
  const absolute = new URL(path, runtimeConfig.centerBaseUrl.replace(/\/+$/, '') + '/');
  if (absolute.protocol === 'https:') {
    absolute.protocol = 'wss:';
  } else if (absolute.protocol === 'http:' || protocol === 'file:') {
    absolute.protocol = 'ws:';
  }
  return absolute.toString();
}

export function apiRuntimeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (runtimeConfig.accessToken) {
    headers.Authorization = `Bearer ${runtimeConfig.accessToken}`;
  } else if (runtimeConfig.userId) {
    headers['X-User-Id'] = runtimeConfig.userId;
  }
  if (runtimeConfig.projectId) {
    headers['X-Project-Id'] = runtimeConfig.projectId;
  }
  if (runtimeConfig.clientSessionId) {
    headers['X-Client-Session-Id'] = runtimeConfig.clientSessionId;
  }
  if (runtimeConfig.centerBaseUrl) {
    headers['X-Center-Base-Url'] = runtimeConfig.centerBaseUrl;
  }
  if (runtimeConfig.runnerBaseUrl) {
    headers['X-Runner-Base-Url'] = runtimeConfig.runnerBaseUrl;
  }
  return headers;
}
