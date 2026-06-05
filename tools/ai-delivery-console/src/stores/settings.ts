import { defineStore } from 'pinia';
import { apiClient } from '@/api/client';
import { setApiRuntimeConfig } from '@/api/runtime';
import {
  defaultDesktopLocalConfig,
  detectDesktopOs,
  loadDesktopLocalConfig,
  saveDesktopLocalConfig,
  type DesktopLocalConfig,
  type DesktopOsType
} from '@/services/desktop-local-config';
import { createDesktopDiagnostics, type DesktopDiagnosticItem } from '@/services/platform-terminal';

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
        if (this.desktopConfig.apiMode === 'remote') {
          this.projectPaths = Array.from(new Set(this.desktopConfig.workspaceMappings.map((item) => item.localPath).filter(Boolean)));
        } else {
          const settings = await apiClient.getSettings();
          this.projectPaths = settings.projectPaths;
        }
      } finally {
        this.loading = false;
      }
    },
    async save(projectPaths: string[]) {
      this.loading = true;
      try {
        const settings = await apiClient.saveSettings(projectPaths);
        this.projectPaths = settings.projectPaths;
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
        mode: this.desktopConfig.apiMode,
        centerBaseUrl: this.desktopConfig.centerBaseUrl,
        userId: this.desktopConfig.userId,
        projectId: this.desktopConfig.projectId
      });
    },
    runDiagnostics() {
      this.diagnostics = createDesktopDiagnostics(this.desktopConfig, this.osType);
    }
  }
});
