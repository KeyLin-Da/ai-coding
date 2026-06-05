export type ApiMode = 'local' | 'remote';
export type DesktopOsType = 'MACOS' | 'WINDOWS' | 'LINUX' | 'UNKNOWN';

export interface WorkspaceMapping {
  projectId: string;
  localPath: string;
}

export interface LocalAgentProviderConfig {
  id: string;
  command: string;
  enabled: boolean;
}

export interface DesktopLocalConfig {
  apiMode: ApiMode;
  centerBaseUrl: string;
  userId: string;
  teamId: string;
  projectId: string;
  terminalPreference: string;
  workspaceMappings: WorkspaceMapping[];
  agentProviders: LocalAgentProviderConfig[];
}

interface DesktopBridge {
  platform?: NodeJS.Platform;
  versions?: Record<string, string | undefined>;
  localConfig?: {
    load: () => Promise<DesktopLocalConfig | null>;
    save: (config: DesktopLocalConfig) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    aiDeliveryDesktop?: DesktopBridge;
  }
}

const LOCAL_STORAGE_KEY = 'ai-delivery.desktop.local-config';

export function defaultDesktopLocalConfig(): DesktopLocalConfig {
  return {
    apiMode: 'local',
    centerBaseUrl: 'http://127.0.0.1:8728',
    userId: '',
    teamId: '',
    projectId: '',
    terminalPreference: defaultTerminalPreference(detectDesktopOs()),
    workspaceMappings: [],
    agentProviders: [
      { id: 'CODEX', command: 'codex', enabled: true },
      { id: 'OPENSPEC', command: 'openspec', enabled: true },
      { id: 'GIT', command: 'git', enabled: true },
      { id: 'NODE', command: 'node', enabled: true }
    ]
  };
}

export async function loadDesktopLocalConfig(): Promise<DesktopLocalConfig> {
  const fromBridge = await window.aiDeliveryDesktop?.localConfig?.load?.();
  if (fromBridge) {
    return mergeConfig(fromBridge);
  }
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return defaultDesktopLocalConfig();
  }
  return mergeConfig(JSON.parse(raw));
}

export async function saveDesktopLocalConfig(config: DesktopLocalConfig): Promise<DesktopLocalConfig> {
  const normalized = mergeConfig(config);
  if (window.aiDeliveryDesktop?.localConfig?.save) {
    await window.aiDeliveryDesktop.localConfig.save(normalized);
  } else {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function detectDesktopOs(): DesktopOsType {
  const platform = window.aiDeliveryDesktop?.platform || '';
  if (platform === 'darwin') {
    return 'MACOS';
  }
  if (platform === 'win32') {
    return 'WINDOWS';
  }
  if (platform === 'linux') {
    return 'LINUX';
  }
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) {
    return 'MACOS';
  }
  if (userAgent.includes('windows')) {
    return 'WINDOWS';
  }
  if (userAgent.includes('linux')) {
    return 'LINUX';
  }
  return 'UNKNOWN';
}

function defaultTerminalPreference(osType: DesktopOsType): string {
  if (osType === 'WINDOWS') {
    return 'WINDOWS_TERMINAL';
  }
  if (osType === 'MACOS') {
    return 'MACOS_TERMINAL';
  }
  return 'SYSTEM_SHELL';
}

function mergeConfig(value: Partial<DesktopLocalConfig>): DesktopLocalConfig {
  const defaults = defaultDesktopLocalConfig();
  return {
    ...defaults,
    ...value,
    apiMode: value.apiMode === 'remote' ? 'remote' : 'local',
    workspaceMappings: Array.isArray(value.workspaceMappings) ? value.workspaceMappings : defaults.workspaceMappings,
    agentProviders: Array.isArray(value.agentProviders) ? value.agentProviders : defaults.agentProviders
  };
}
