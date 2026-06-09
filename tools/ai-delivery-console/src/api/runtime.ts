interface ApiRuntimeConfig {
  centerBaseUrl: string;
  runnerBaseUrl: string;
  accessToken: string;
  userId: string;
  clientSessionId: string;
  projectId: string;
}

let runtimeConfig: ApiRuntimeConfig = {
  centerBaseUrl: 'http://127.0.0.1:8728',
  runnerBaseUrl: 'http://127.0.0.1:8718',
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

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${runtimeConfig.centerBaseUrl.replace(/\/+$/, '')}${path}`;
}

export function resolveRunnerApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
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
