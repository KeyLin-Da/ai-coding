import { defineStore } from 'pinia';
import type { ActionInput, AgentProvider, RequirementInput, RequirementWorkflow, ReviewInput, RunEvent } from '@shared/workflow';
import { apiClient, type DeleteTechDesignQuestionInput } from '@/api/client';
import { getApiRuntimeConfig, isRemoteApiMode, resolveApiUrl } from '@/api/runtime';

interface WorkflowState {
  requirements: RequirementWorkflow[];
  current?: RequirementWorkflow;
  loading: boolean;
  runEvents: RunEvent[];
  agents: AgentProvider[];
  eventSource?: EventSource;
  workflowEventSource?: EventSource;
}

export const useWorkflowStore = defineStore('workflow', {
  state: (): WorkflowState => ({
    requirements: [],
    current: undefined,
    loading: false,
    runEvents: [],
    agents: [],
    eventSource: undefined,
    workflowEventSource: undefined
  }),
  actions: {
    async loadAgents() {
      this.agents = await apiClient.listAgents();
    },
    async loadRequirements() {
      this.loading = true;
      try {
        this.requirements = await apiClient.listRequirements();
      } finally {
        this.loading = false;
      }
    },
    async createRequirement(input: RequirementInput) {
      const workflow = await apiClient.createRequirement(input);
      this.current = workflow;
      await this.loadRequirements();
      return workflow;
    },
    async loadRequirement(requirementId: string) {
      this.loading = true;
      try {
        this.current = await apiClient.getRequirement(requirementId);
      } finally {
        this.loading = false;
      }
    },
    async runAction(input: ActionInput) {
      if (!this.current) {
        return undefined;
      }
      const result = await apiClient.runAction(this.current.requirementId, input);
      this.current = result.workflow;
      await this.loadRequirements();
      return result;
    },
    async submitReview(input: Omit<ReviewInput, 'requirementId'>) {
      if (!this.current) {
        return;
      }
      this.current = await apiClient.submitReview({
        ...input,
        requirementId: this.current.requirementId
      });
      await this.loadRequirements();
    },
    async loadRunEvents(runId: string) {
      if (!this.current) {
        return;
      }
      this.runEvents = await apiClient.getRunEvents(this.current.requirementId, runId);
    },
    streamRunEvents(runId: string) {
      if (!this.current) {
        return;
      }
      this.stopRunStream();
      const requirementId = this.current.requirementId;
      const runtime = getApiRuntimeConfig();
      const streamPath = isRemoteApiMode()
        ? `/api/ai-delivery/runs/${encodeURIComponent(runId)}/events/subscribe?userId=${encodeURIComponent(runtime.userId)}`
        : `/api/ai-delivery/runs/${encodeURIComponent(runId)}/stream?requirementId=${encodeURIComponent(requirementId)}&tail=1`;
      this.eventSource = new EventSource(resolveApiUrl(streamPath));
      const appendEvent = (event: MessageEvent) => {
        this.runEvents.push(JSON.parse(event.data) as RunEvent);
      };
      this.eventSource.onmessage = appendEvent;
      this.eventSource.addEventListener?.('run-event', appendEvent as EventListener);
      this.eventSource.onerror = () => {
        this.stopRunStream();
      };
    },
    stopRunStream() {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = undefined;
      }
    },
    streamWorkflowEvents() {
      if (!this.current || !isRemoteApiMode()) {
        return;
      }
      this.stopWorkflowStream();
      const runtime = getApiRuntimeConfig();
      if (!runtime.projectId || !runtime.userId) {
        return;
      }
      const requirementPk = this.current.id ? `&requirementPk=${encodeURIComponent(String(this.current.id))}` : '';
      this.workflowEventSource = new EventSource(
        resolveApiUrl(
          `/api/ai-delivery/events/subscribe?projectId=${encodeURIComponent(runtime.projectId)}&userId=${encodeURIComponent(runtime.userId)}${requirementPk}`
        )
      );
      const refresh = () => {
        if (this.current) {
          void this.loadRequirement(this.current.requirementId);
          void this.loadRequirements();
        }
      };
      this.workflowEventSource.onmessage = refresh;
      this.workflowEventSource.addEventListener?.('domain-event', refresh as EventListener);
      this.workflowEventSource.onerror = () => this.stopWorkflowStream();
    },
    stopWorkflowStream() {
      if (this.workflowEventSource) {
        this.workflowEventSource.close();
        this.workflowEventSource = undefined;
      }
    },
    async cancelRun(runId: string) {
      if (!this.current) {
        return;
      }
      await apiClient.cancelRun(this.current.requirementId, runId);
      await this.loadRequirement(this.current.requirementId);
    },
    async uploadPrdFiles(files: File[]) {
      if (!this.current) {
        return;
      }
      this.current = await apiClient.uploadPrdFiles(this.current.requirementId, files);
      await this.loadRequirements();
    },
    async deletePrdFile(fileId: string) {
      if (!this.current) {
        return;
      }
      this.current = await apiClient.deletePrdFile(this.current.requirementId, fileId);
      await this.loadRequirements();
    },
    async uploadTechDesignFiles(files: File[]) {
      if (!this.current) {
        return;
      }
      this.current = await apiClient.uploadTechDesignFiles(this.current.requirementId, files);
      await this.loadRequirements();
    },
    async deleteTechDesignFile(fileId: string) {
      if (!this.current) {
        return;
      }
      this.current = await apiClient.deleteTechDesignFile(this.current.requirementId, fileId);
      await this.loadRequirements();
    },
    async deleteTechDesignQuestion(input: DeleteTechDesignQuestionInput) {
      if (!this.current) {
        return;
      }
      this.current = await apiClient.deleteTechDesignQuestion(this.current.requirementId, input);
      await this.loadRequirements();
    }
  }
});
