import { defineStore } from 'pinia';
import { apiClient, type DeliveryProjectVO, type ProjectCreateInput, type WorkspaceMappingVO } from '@/api/client';
import { setApiRuntimeConfig } from '@/api/runtime';

const PROJECT_STORAGE_KEY = 'ai-delivery.selected-project';

interface ProjectState {
  projects: DeliveryProjectVO[];
  current?: DeliveryProjectVO;
  workspaceMappings: WorkspaceMappingVO[];
  loading: boolean;
}

export const useProjectStore = defineStore('project', {
  state: (): ProjectState => ({
    projects: [],
    current: undefined,
    workspaceMappings: [],
    loading: false
  }),
  actions: {
    async loadProjects() {
      this.loading = true;
      try {
        this.projects = await apiClient.listMyProjects();
        const selectedId = window.localStorage.getItem(PROJECT_STORAGE_KEY);
        if (selectedId && !this.current) {
          const matched = this.projects.find((project) => String(project.id) === selectedId);
          if (matched) {
            await this.selectProject(matched);
          }
        }
      } finally {
        this.loading = false;
      }
    },
    async createProject(input: ProjectCreateInput) {
      const project = await apiClient.createProject(input);
      await this.loadProjects();
      await this.selectProject(project);
      return project;
    },
    async joinProject(code: string) {
      const project = await apiClient.joinProject({ code });
      await this.loadProjects();
      await this.selectProject(project);
      return project;
    },
    async selectProject(project: DeliveryProjectVO) {
      const selected = await apiClient.selectProject(project.id);
      this.current = selected;
      window.localStorage.setItem(PROJECT_STORAGE_KEY, String(selected.id));
      this.applyRuntime();
      await this.loadWorkspaceMappings();
    },
    async bootstrapRepository(repository: ProjectCreateInput['repository']) {
      if (!this.current) {
        return undefined;
      }
      const selected = await apiClient.bootstrapProjectRepository(this.current.id, repository);
      this.current = selected;
      this.projects = this.projects.map((project) => (project.id === selected.id ? selected : project));
      this.applyRuntime();
      return selected;
    },
    async loadWorkspaceMappings() {
      if (!this.current) {
        this.workspaceMappings = [];
        return;
      }
      this.workspaceMappings = await apiClient.listWorkspaceMappings(this.current.id);
    },
    async addWorkspaceMapping(localPath: string) {
      if (!this.current) {
        return;
      }
      await apiClient.saveWorkspaceMapping(this.current.id, { localPath });
      await this.loadWorkspaceMappings();
    },
    async disableWorkspaceMapping(mappingId: string | number) {
      if (!this.current) {
        return;
      }
      await apiClient.disableWorkspaceMapping(this.current.id, mappingId);
      await this.loadWorkspaceMappings();
    },
    clearSelection() {
      this.current = undefined;
      this.workspaceMappings = [];
      window.localStorage.removeItem(PROJECT_STORAGE_KEY);
      this.applyRuntime();
    },
    applyRuntime() {
      setApiRuntimeConfig({
        projectId: this.current?.id ? String(this.current.id) : ''
      });
    }
  }
});
