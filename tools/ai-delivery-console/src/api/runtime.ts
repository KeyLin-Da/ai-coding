import type { ApiMode } from '@/services/desktop-local-config';

interface ApiRuntimeConfig {
  mode: ApiMode;
  centerBaseUrl: string;
  localBaseUrl: string;
  userId: string;
  projectId: string;
}

let runtimeConfig: ApiRuntimeConfig = {
  mode: 'local',
  centerBaseUrl: 'http://127.0.0.1:8728',
  localBaseUrl: 'http://127.0.0.1:8718',
  userId: '',
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

export function isRemoteApiMode(): boolean {
  return runtimeConfig.mode === 'remote';
}

export function resolveApiUrl(path: string, protocol = window.location.protocol): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (runtimeConfig.mode === 'remote') {
    return `${runtimeConfig.centerBaseUrl.replace(/\/+$/, '')}${path}`;
  }
  if (protocol === 'file:') {
    return `${runtimeConfig.localBaseUrl.replace(/\/+$/, '')}${path}`;
  }
  return path;
}

export function apiRuntimeHeaders(): Record<string, string> {
  return runtimeConfig.userId ? { 'X-User-Id': runtimeConfig.userId } : {};
}
