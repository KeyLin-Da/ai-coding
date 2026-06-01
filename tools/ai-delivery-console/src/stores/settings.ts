import { defineStore } from 'pinia';
import { apiClient } from '@/api/client';

interface SettingsState {
  projectPaths: string[];
  loading: boolean;
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    projectPaths: [],
    loading: false
  }),
  actions: {
    async load() {
      this.loading = true;
      try {
        const settings = await apiClient.getSettings();
        this.projectPaths = settings.projectPaths;
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
    }
  }
});
