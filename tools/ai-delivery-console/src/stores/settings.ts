import { defineStore } from 'pinia';
import { setApiRuntimeConfig } from '@/api/runtime';
import { apiClient } from '@/api/client';
import {
  defaultDesktopLocalConfig,
  detectDesktopOs,
  loadDesktopLocalConfig,
  saveDesktopLocalConfig,
  type DesktopLocalConfig,
  type DesktopOsType
} from '@/services/desktop-local-config';
import { createDesktopDiagnostics, type DesktopDiagnosticItem } from '@/services/platform-terminal';

/** 向中心服务注册客户端会话，返回服务端分配的 clientSessionId */
async function registerClientSession(): Promise<string | undefined> {
  const osType = detectDesktopOs();
  const result = await apiClient.registerClientSession({
    osType,
    capabilities: ['DESKTOP']
  });
  return String(result.id);
}

interface SettingsState {
  projectPaths: string[];
  desktopConfig: DesktopLocalConfig;
  osType: DesktopOsType;
  diagnostics: DesktopDiagnosticItem[];
  loading: boolean;
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    projectPaths: [],
    desktopConfig: defaultDesktopLocalConfig(),
    osType: detectDesktopOs(),
    diagnostics: [],
    loading: false
  }),
  actions: {
    async load() {
      this.loading = true;
      try {
        this.desktopConfig = await loadDesktopLocalConfig();
        this.osType = detectDesktopOs();
        this.applyRuntime();
        this.runDiagnostics();
        this.projectPaths = Array.from(new Set(this.desktopConfig.workspaceMappings.map((item) => item.localPath).filter(Boolean)));
      } finally {
        this.loading = false;
      }
    },
    /** 用户认证后调用，确保 clientSessionId 已注册到中心服务 */
    async ensureClientSessionId() {
      if (this.desktopConfig.clientSessionId) {
        return;
      }
      try {
        const sessionId = await registerClientSession();
        if (sessionId) {
          this.desktopConfig.clientSessionId = sessionId;
          this.desktopConfig = await saveDesktopLocalConfig(this.desktopConfig);
          this.applyRuntime();
          this.runDiagnostics();
        }
      } catch (e) {
        console.warn('[Settings] 注册客户端会话失败:', e);
      }
    },
    async save(projectPaths: string[]) {
      this.loading = true;
      try {
        this.projectPaths = projectPaths;
      } finally {
        this.loading = false;
      }
    },
    async saveDesktop(config: DesktopLocalConfig) {
      this.loading = true;
      try {
        this.desktopConfig = await saveDesktopLocalConfig(config);
        this.applyRuntime();
        this.runDiagnostics();
      } finally {
        this.loading = false;
      }
    },
    applyRuntime() {
      setApiRuntimeConfig({
        centerBaseUrl: this.desktopConfig.centerBaseUrl,
        runnerBaseUrl: this.desktopConfig.runnerBaseUrl,
        userId: this.desktopConfig.userId,
        clientSessionId: this.desktopConfig.clientSessionId
      });
    },
    runDiagnostics() {
      this.diagnostics = createDesktopDiagnostics(this.desktopConfig, this.osType);
    }
  }
});
