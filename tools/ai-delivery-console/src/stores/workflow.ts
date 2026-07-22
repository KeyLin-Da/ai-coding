import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';
import type { ActionInput, AgentProvider, RequirementInput, RequirementWorkflow, ReviewInput, RunEvent, SupplementInputsUpdate, TerminalSessionStatus } from '@shared/workflow';
import { apiClient, type DeleteTechDesignQuestionInput } from '@/api/client';
import { getApiRuntimeConfig } from '@/api/runtime';
import { dispatchTechDesignAnnotationChanged } from '@/services/annotation-realtime';
import { RealtimeClient, type RealtimeDomainEvent } from '@/services/realtime-client';

let requirementsLoadInFlight: Promise<RequirementWorkflow[]> | undefined;
const requirementLoadInFlight = new Map<string, Promise<RequirementWorkflow>>();

function isCenterRunId(runId: string | number): boolean {
  return /^\d+$/.test(String(runId).trim());
}

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
  activeTerminalRunId?: string;
  selectedTerminalRunId?: string;
  terminalConnectionStatus: TerminalSessionStatus;
  runEventSeqs: Record<string, number>;
  runEventSource?: EventSource;
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
    activeTerminalRunId: undefined,
    selectedTerminalRunId: undefined,
    terminalConnectionStatus: 'DISCONNECTED',
    runEventSeqs: {},
    runEventSource: undefined
  }),
  actions: {
    async loadAgents() {
      this.agents = await apiClient.listAgents();
    },
    async loadRequirements() {
      if (requirementsLoadInFlight) {
        this.requirements = await requirementsLoadInFlight;
        this.rememberWorkflowEventIds(this.requirements);
        return;
      }
      this.loading = true;
      const promise = apiClient.listRequirements();
      requirementsLoadInFlight = promise;
      try {
        this.requirements = await promise;
        this.rememberWorkflowEventIds(this.requirements);
      } finally {
        if (requirementsLoadInFlight === promise) {
          requirementsLoadInFlight = undefined;
        }
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
      const normalizedRequirementId = String(requirementId);
      const existing = requirementLoadInFlight.get(normalizedRequirementId);
      if (existing) {
        this.current = await existing;
        this.rememberWorkflowEventIds([this.current]);
        return;
      }
      this.loading = true;
      const promise = apiClient.getRequirement(normalizedRequirementId);
      requirementLoadInFlight.set(normalizedRequirementId, promise);
      try {
        this.current = await promise;
        this.rememberWorkflowEventIds([this.current]);
      } finally {
        if (requirementLoadInFlight.get(normalizedRequirementId) === promise) {
          requirementLoadInFlight.delete(normalizedRequirementId);
        }
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
      const requirementId = this.current.requirementId;
      await apiClient.submitReview({
        ...input,
        requirementId,
        requirementPk: this.current.id
      });
      if (input.stage === 'IMPLEMENTATION' && input.implementationStep === 'CHANGE_INSPECTION' && input.decision === 'APPROVED') {
        await apiClient.captureAiCodeCompletenessAiCommit(requirementId).catch((error: Error) => {
          ElMessage.warning(`审核已保存，AI Commit 自动记录失败：${error.message || 'unknown error'}`);
        });
      }
      await this.loadRequirement(requirementId);
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
      if (isCenterRunId(runId)) {
        void this.ensureRealtimeClient()
          .then((client) => client.subscribeRun(runId, this.runEventSeqs[runId] || 0))
          .catch(() => {
            this.realtimeStatus = 'ERROR';
          });
        return;
      }
      const source = apiClient.openRunEventStream(this.current.requirementId, runId);
      this.runEventSource = source;
      source.onmessage = (event) => {
        if (this.activeRunId !== runId) {
          return;
        }
        const runEvent = JSON.parse(event.data) as RunEvent;
        this.runEvents.push(runEvent);
        this.runEventSeqs[runId] = this.runEvents.length;
      };
      source.onerror = () => {
        const shouldRefresh = this.activeRunId === runId;
        const requirementId = shouldRefresh ? this.current?.requirementId : undefined;
        source.close();
        if (this.runEventSource === source || shouldRefresh) {
          this.runEventSource = undefined;
        }
        if (shouldRefresh) {
          this.activeRunId = undefined;
        }
        if (requirementId) {
          void this.loadRequirement(requirementId)
            .then(() => this.loadRequirements())
            .catch(() => undefined);
        }
      };
    },
    stopRunStream() {
      this.runEventSource?.close();
      this.runEventSource = undefined;
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
    setActiveTerminalRun(runId?: string) {
      this.activeTerminalRunId = runId;
      if (runId) {
        this.selectedTerminalRunId = runId;
      }
    },
    selectTerminalRun(runId?: string) {
      this.selectedTerminalRunId = runId;
    },
    setTerminalConnectionStatus(status: TerminalSessionStatus) {
      this.terminalConnectionStatus = status;
    },
    mergeWorkflowLocally(workflow: RequirementWorkflow) {
      this.current = workflow;
      this.rememberWorkflowEventIds([workflow]);
      const index = this.requirements.findIndex((item) => item.requirementId === workflow.requirementId);
      if (index >= 0) {
        this.requirements.splice(index, 1, workflow);
      }
    },
    async updateSupplementInputs(input: SupplementInputsUpdate) {
      if (!this.current) {
        return;
      }
      this.mergeWorkflowLocally(await apiClient.updateSupplementInputs(this.current.requirementId, input));
    },
    async uploadPrdFiles(files: File[]) {
      if (!this.current) {
        return;
      }
      this.mergeWorkflowLocally(await apiClient.uploadPrdFiles(this.current.requirementId, files));
    },
    async deletePrdFile(fileId: string) {
      if (!this.current) {
        return;
      }
      this.mergeWorkflowLocally(await apiClient.deletePrdFile(this.current.requirementId, fileId));
    },
    async uploadTechDesignFiles(files: File[]) {
      if (!this.current) {
        return;
      }
      this.mergeWorkflowLocally(await apiClient.uploadTechDesignFiles(this.current.requirementId, files));
    },
    async deleteTechDesignFile(fileId: string) {
      if (!this.current) {
        return;
      }
      this.mergeWorkflowLocally(await apiClient.deleteTechDesignFile(this.current.requirementId, fileId));
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
      const payload = parseEventPayload(event.payloadJson);
      const refreshPlan = getRealtimeRefreshPlan(event);
      if (refreshPlan.current && shouldRefreshCurrentRequirement(payload, this.current)) {
        await this.loadRequirement(this.current.requirementId);
      }
      if (refreshPlan.list) {
        await this.loadRequirements();
      }
    },
    applyRealtimeHint(event: RealtimeDomainEvent) {
      const runtime = getApiRuntimeConfig();
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
      if (event.eventType === 'tech-design.annotation.changed') {
        dispatchTechDesignAnnotationChanged({
          ...payload,
          requirementPk: payload.requirementPk ?? event.aggregateId,
          eventId: event.eventId,
          eventType: event.eventType
        });
      }
      if (event.eventType === 'project.repo.pull-required') {
        const targetUserIds = Array.isArray(payload.targetUserIds) ? payload.targetUserIds.map((item) => String(item)) : [];
        if (!targetUserIds.length || targetUserIds.includes(String(runtime.userId))) {
          ElMessage.warning('项目产物仓有新提交，请点击右上角“同步 Git 仓”后继续操作');
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
    },
    rememberWorkflowEventIds(workflows: RequirementWorkflow[]) {
      const eventIds = workflows
        .map((workflow) => Number(workflow.lastEventId || 0))
        .filter((eventId) => Number.isFinite(eventId) && eventId > 0);
      if (eventIds.length) {
        this.lastEventId = Math.max(this.lastEventId, ...eventIds);
      }
    }
  }
});

interface RealtimeRefreshPlan {
  current: boolean;
  list: boolean;
}

const REALTIME_REFRESH_PLANS: Record<string, RealtimeRefreshPlan> = {
  'artifact.version.created': { current: true, list: true },
  'artifact.git-sync.completed': { current: true, list: true },
  'workflow.stage.reviewed': { current: true, list: true },
  'tech-design.annotation.changed': { current: false, list: false }
};

function getRealtimeRefreshPlan(event: RealtimeDomainEvent): RealtimeRefreshPlan {
  return REALTIME_REFRESH_PLANS[event.eventType] || { current: false, list: false };
}

function shouldRefreshCurrentRequirement(payload: Record<string, unknown>, current?: RequirementWorkflow): current is RequirementWorkflow {
  if (!current) {
    return false;
  }
  const requirementPk = payload.requirementPk == null ? undefined : String(payload.requirementPk);
  return !requirementPk || String(current.id) === requirementPk;
}

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
