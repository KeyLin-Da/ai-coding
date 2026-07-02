interface ApiRuntimeConfig {
  centerBaseUrl: string;
  runnerBaseUrl: string;
  accessToken: string;
  userId: string;
  clientSessionId: string;
  projectId: string;
}

export const CENTER_PROXY_PREFIX = '/center-api';
export const RUNNER_PROXY_PREFIX = '/runner-api';

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

function usesSameOriginGateway(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function pathFromUrl(value: string): string {
  if (/^(https?|wss?):\/\//.test(value)) {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function proxyPath(prefix: string, value: string): string {
  const pathname = pathFromUrl(value);
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    return pathname;
  }
  return `${prefix}${pathname}`;
}

function absoluteApiUrl(baseUrl: string, value: string): string {
  if (/^https?:\/\//.test(value)) {
    return value;
  }
  return `${baseUrl.replace(/\/+$/, '')}${pathFromUrl(value)}`;
}

export function resolveApiUrl(path: string): string {
  if (usesSameOriginGateway()) {
    return proxyPath(CENTER_PROXY_PREFIX, path);
  }
  return absoluteApiUrl(runtimeConfig.centerBaseUrl, path);
}

export function resolveRunnerApiUrl(path: string): string {
  if (usesSameOriginGateway()) {
    return proxyPath(RUNNER_PROXY_PREFIX, path);
  }
  return absoluteApiUrl(runtimeConfig.runnerBaseUrl, path);
}

export function resolveWebSocketUrl(path: string, protocol?: string): string {
  const pageProtocol = protocol || (typeof window === 'undefined' ? 'http:' : window.location.protocol);
  if (usesSameOriginGateway()) {
    const absolute = new URL(proxyPath(CENTER_PROXY_PREFIX, path), window.location.origin);
    absolute.protocol = pageProtocol === 'https:' ? 'wss:' : 'ws:';
    return absolute.toString();
  }
  if (/^wss?:\/\//.test(path)) {
    return path;
  }
  const absolute = new URL(path, runtimeConfig.centerBaseUrl.replace(/\/+$/, '') + '/');
  if (absolute.protocol === 'https:') {
    absolute.protocol = 'wss:';
  } else if (absolute.protocol === 'http:' || pageProtocol === 'file:') {
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
