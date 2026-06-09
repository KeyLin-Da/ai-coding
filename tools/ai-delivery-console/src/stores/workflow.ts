import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';
import type { ActionInput, AgentProvider, RequirementInput, RequirementWorkflow, ReviewInput, RunEvent } from '@shared/workflow';
import { apiClient, type DeleteTechDesignQuestionInput } from '@/api/client';
import { getApiRuntimeConfig } from '@/api/runtime';
import { RealtimeClient, type RealtimeDomainEvent } from '@/services/realtime-client';
import { useSettingsStore } from '@/stores/settings';

interface WorkflowState {
  requirements: RequirementWorkflow[];
  current?: RequirementWorkflow;
  loading: boolean;
  runEvents: RunEvent[];
  agents: AgentProvider[];
  realtimeClient?: RealtimeClient;
  realtimeStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastEventId: number;
  activeRunId?: string;
  runEventSeqs: Record<string, number>;
}

export const useWorkflowStore = defineStore('workflow', {
  state: (): WorkflowState => ({
    requirements: [],
    current: undefined,
    loading: false,
    runEvents: [],
    agents: [],
    realtimeClient: undefined,
    realtimeStatus: 'DISCONNECTED',
    lastEventId: 0,
    activeRunId: undefined,
    runEventSeqs: {}
  }),
  actions: {
    async loadAgents() {
      const settings = useSettingsStore();
      this.agents = settings.desktopConfig.agentProviders.map((provider) => ({
        id: provider.id.toLowerCase(),
        name: provider.id,
        description: `本机命令：${provider.command}`,
        inputMode: 'STDIN',
        command: [provider.command],
        interactiveCommand: [provider.command],
        available: provider.enabled,
        supportsStreaming: true,
        supportsInteractive: true
      }));
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
      this.runEventSeqs[runId] = this.runEvents.length;
    },
    streamRunEvents(runId: string) {
      if (!this.current) {
        return;
      }
      this.stopRunStream();
      this.activeRunId = runId;
      const runtime = getApiRuntimeConfig();
      if (!runtime.projectId || !runtime.userId || !runtime.clientSessionId) {
        return;
      }
      void this.ensureRealtimeClient()
        .then((client) => client.subscribeRun(runId, this.runEventSeqs[runId] || 0))
        .catch(() => {
          this.realtimeStatus = 'ERROR';
        });
    },
    stopRunStream() {
      this.activeRunId = undefined;
    },
    streamWorkflowEvents() {
      if (!this.current) {
        return;
      }
      const runtime = getApiRuntimeConfig();
      if (!runtime.projectId || !runtime.userId || !runtime.clientSessionId) {
        return;
      }
      void this.ensureRealtimeClient()
        .then((client) => client.subscribeProject(runtime.projectId, this.lastEventId, this.current?.id))
        .catch(() => {
          this.realtimeStatus = 'ERROR';
        });
    },
    stopWorkflowStream() {
      this.realtimeClient?.disconnect();
      this.realtimeClient = undefined;
      this.realtimeStatus = 'DISCONNECTED';
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
    },
    async ensureRealtimeClient(): Promise<RealtimeClient> {
      if (!this.realtimeClient) {
        this.realtimeClient = new RealtimeClient({
          onStatus: (status) => {
            this.realtimeStatus = status;
          },
          onDomainEvent: (event) => {
            void this.handleRealtimeDomainEvent(event);
          },
          onRunEvent: (event, raw) => {
            const activeRunId = this.activeRunId;
            if (activeRunId && String(raw.runId) !== String(activeRunId)) {
              return;
            }
            const previousSeq = this.runEventSeqs[String(raw.runId)] || 0;
            if (raw.seq <= previousSeq) {
              return;
            }
            this.runEventSeqs[String(raw.runId)] = raw.seq;
            this.runEvents.push(event);
          },
          onRefreshRequired: () => {
            void this.loadRequirements();
            if (this.current) {
              void this.loadRequirement(this.current.requirementId);
            }
          }
        });
      }
      await this.realtimeClient.connect();
      return this.realtimeClient;
    },
    async handleRealtimeDomainEvent(event: RealtimeDomainEvent) {
      const runtime = getApiRuntimeConfig();
      this.lastEventId = Math.max(this.lastEventId, event.eventId || 0);
      this.realtimeClient?.ack(runtime.projectId, this.lastEventId);
      this.applyRealtimeHint(event);
      if (this.current) {
        await this.loadRequirement(this.current.requirementId);
      }
      await this.loadRequirements();
    },
    applyRealtimeHint(event: RealtimeDomainEvent) {
      const payload = parseEventPayload(event.payloadJson);
      const requirementPk = payload.requirementPk == null ? undefined : String(payload.requirementPk);
      if (event.eventType === 'artifact.version.created') {
        ElMessage.info('检测到新产物版本，已刷新');
      }
      if (event.eventType === 'artifact.git-sync.completed') {
        const commitSha = String(payload.commitSha || '');
        ElMessage.success(commitSha ? `产物已推送：${commitSha}` : '产物Git同步已完成');
      }
      if (event.eventType === 'artifact.git-sync.blocked') {
        ElMessage.warning(String(payload.errorMessage || '产物Git同步被阻断'));
      }
      if (event.eventType === 'project.repo.pull-required') {
        const targetUserIds = Array.isArray(payload.targetUserIds) ? payload.targetUserIds.map((item) => String(item)) : [];
        if (!targetUserIds.length || targetUserIds.includes(String(runtime.userId))) {
          ElMessage.warning('项目产物仓有新提交，请点击右上角“同步 Git 仓”后继续操作');
        }
      }
      if (event.eventType === 'project.repo.state-changed') {
        const status = String(payload.syncStatus || '');
        if (status && status !== 'READY' && status !== 'PUSHED') {
          ElMessage.info(`项目产物仓状态：${status}`);
        }
      }
      if (event.eventType === 'execution.lock.updated' && requirementPk) {
        const status = String(payload.status || '');
        const stage = String(payload.stage || '');
        const actionType = String(payload.actionType || '');
        const label = status === 'ACTIVE' ? `${stage || actionType} 执行中` : undefined;
        this.requirements = this.requirements.map((item) => (String(item.id) === requirementPk ? { ...item, jobStatus: label } : item));
        if (this.current && String(this.current.id) === requirementPk) {
          this.current = { ...this.current, jobStatus: label };
        }
      }
    }
  }
});

function parseEventPayload(payloadJson?: string): Record<string, unknown> {
  if (!payloadJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
