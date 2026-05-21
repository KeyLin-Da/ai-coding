import { defineStore } from 'pinia';
import type { ActionInput, RequirementInput, RequirementWorkflow, ReviewInput, RunEvent } from '@shared/workflow';
import { apiClient } from '@/api/client';

interface WorkflowState {
  requirements: RequirementWorkflow[];
  current?: RequirementWorkflow;
  loading: boolean;
  runEvents: RunEvent[];
}

export const useWorkflowStore = defineStore('workflow', {
  state: (): WorkflowState => ({
    requirements: [],
    current: undefined,
    loading: false,
    runEvents: []
  }),
  actions: {
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
        return;
      }
      const result = await apiClient.runAction(this.current.requirementId, input);
      this.current = result.workflow;
      await this.loadRequirements();
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
    }
  }
});
