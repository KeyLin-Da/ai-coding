<template>
  <section class="embedded-terminal-workbench" :class="{ fullscreen: fullscreenMode }" aria-label="内嵌终端工作台">
    <header class="terminal-workbench-header">
      <div class="terminal-title">
        <strong>Agent 终端</strong>
        <span>{{ activeRunLabel }}</span>
      </div>
      <div class="terminal-toolbar">
        <el-tag size="small" :type="connectionTagType" effect="plain">{{ connectionStatusText }}</el-tag>
        <el-button :icon="Refresh" :disabled="!canReconnect" title="重连" @click="reconnectTerminal" />
        <el-button :icon="SwitchButton" :disabled="!canSendSignal" title="Ctrl-C" @click="sendCtrlC" />
        <el-button :icon="CopyDocument" :disabled="!selectedRun" title="复制可见内容" @click="copyVisibleTerminal" />
        <el-button :icon="Tickets" :disabled="!selectedRun" title="运行日志" @click="openSelectedRunLog" />
        <el-button :icon="FullScreen" title="全屏" @click="fullscreenMode = !fullscreenMode" />
        <el-button v-if="canCancel" type="danger" @click="cancelSelectedRun">结束会话</el-button>
      </div>
    </header>

    <el-tabs v-model="activeTab" class="terminal-tabs">
      <el-tab-pane label="当前终端" name="current">
        <div class="terminal-tab-body current-terminal-body">
          <el-alert v-if="modeFallbackMessage" type="info" show-icon :title="modeFallbackMessage" />
          <EmbeddedTerminalPane
            v-if="liveRun"
            ref="livePane"
            :run-id="liveRun.id"
            :transcript-text="liveTranscriptText"
            :readonly="!isLiveControllable"
            :auto-connect="isLiveControllable"
            @status="handleConnectionStatus"
            @error="handleTerminalError"
          />
          <div v-else class="terminal-empty">
            <strong>暂无运行中的内嵌终端</strong>
            <span>{{ terminalRuns.length ? '可在历史会话中查看最近一次输出。' : '启动任一 Agent 动作后会在这里显示。' }}</span>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="历史会话" name="history">
        <div class="terminal-tab-body history-layout">
          <aside class="terminal-history-list">
            <button
              v-for="run in terminalRuns"
              :key="run.id"
              class="terminal-history-item"
              :class="{ active: selectedRunId === run.id }"
              type="button"
              @click="selectRun(run.id)"
            >
              <span class="history-row-main">
                <strong>{{ runContextLabel(run) }}</strong>
                <small>{{ run.id }}</small>
              </span>
              <span class="history-row-meta">
                <el-tag size="small" :type="runStatusTagType(run.status)" effect="light">{{ statusLabels[run.status] }}</el-tag>
                <small>{{ formatRunStartedAt(run.startedAt) }}</small>
              </span>
            </button>
            <el-empty v-if="!terminalRuns.length" description="暂无终端会话" />
          </aside>
          <div v-if="selectedRun" class="history-replay-panel">
            <el-alert v-if="selectedTranscriptTruncated" type="warning" show-icon title="Transcript 过长，仅展示最新片段" />
            <EmbeddedTerminalPane
              :key="`history-${selectedRun.id}`"
              :run-id="selectedRun.id"
              :transcript-text="selectedTranscriptText"
              readonly
              :auto-connect="false"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="运行日志" name="logs">
        <div class="terminal-tab-body run-events-panel">
          <div class="terminal-inline-actions">
            <span class="muted">{{ selectedRun ? `${selectedEvents.length} 条事件` : '未选择会话' }}</span>
            <el-button :disabled="!selectedRun" :icon="Tickets" @click="openSelectedRunLog">完整日志</el-button>
          </div>
          <div v-if="selectedEvents.length" class="terminal-event-list">
            <article v-for="(event, index) in selectedEvents" :key="`${event.time}-${index}`" class="terminal-event-row">
              <span :class="['event-level', event.level.toLowerCase()]">{{ event.level }}</span>
              <div>
                <strong>{{ event.message }}</strong>
                <pre v-if="event.text">{{ event.text }}</pre>
              </div>
            </article>
          </div>
          <el-empty v-else description="暂无日志事件" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="Token" name="tokens">
        <div class="terminal-tab-body token-panel">
          <div class="token-metric">
            <small>本次 Token</small>
            <strong>{{ runTokenText }}</strong>
          </div>
          <div class="token-metric">
            <small>明细</small>
            <strong>{{ tokenDetailCount }}</strong>
          </div>
          <el-button :disabled="!selectedRun" @click="openSelectedRunLog">查看 Token 明细</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CopyDocument, FullScreen, Refresh, SwitchButton, Tickets } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type {
  ExecutionMode,
  ImplementationStep,
  RequirementWorkflow,
  RunEvent,
  RunRecord,
  RunStatus,
  RunTokenUsageRun,
  TerminalSessionStatus,
  WorkflowStage
} from '@shared/workflow';
import {
  executionModeLabels,
  implementationStepLabels,
  stageLabels,
  statusLabels
} from '@shared/workflow';
import { apiClient } from '@/api/client';
import EmbeddedTerminalPane from '@/components/EmbeddedTerminalPane.vue';

const props = withDefaults(
  defineProps<{
    workflow: RequirementWorkflow;
    currentRun?: RunRecord;
    events?: RunEvent[];
    selectedExecutionMode: ExecutionMode;
    activeStage: WorkflowStage;
    activeImplementationStep?: ImplementationStep;
    tokenUsage?: RunTokenUsageRun;
    runTokenText?: string;
    connectionStatus?: TerminalSessionStatus;
  }>(),
  {
    currentRun: undefined,
    events: () => [],
    activeImplementationStep: undefined,
    tokenUsage: undefined,
    runTokenText: '0',
    connectionStatus: 'DISCONNECTED'
  }
);

const emit = defineEmits<{
  (event: 'open-log', runId: string): void;
  (event: 'cancel-run', runId: string): void;
  (event: 'connection-status', status: TerminalSessionStatus): void;
}>();

const activeTab = ref<'current' | 'history' | 'logs' | 'tokens'>('current');
const selectedRunId = ref('');
const eventsByRunId = ref<Record<string, RunEvent[]>>({});
const fullscreenMode = ref(false);
const livePane = ref<InstanceType<typeof EmbeddedTerminalPane>>();

const terminalRuns = computed(() =>
  [...(props.workflow.runs || [])]
    .filter((run) => run.executionMode === 'EMBEDDED_TERMINAL' || run.executionMode === 'INTERACTIVE_TERMINAL')
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
);

const liveRun = computed(() => {
  if (props.currentRun?.executionMode === 'EMBEDDED_TERMINAL') {
    return props.currentRun;
  }
  return terminalRuns.value.find((run) => run.executionMode === 'EMBEDDED_TERMINAL' && run.status === 'RUNNING');
});

const selectedRun = computed(() => terminalRuns.value.find((run) => run.id === selectedRunId.value) || liveRun.value || terminalRuns.value[0]);
const selectedEvents = computed(() => {
  const run = selectedRun.value;
  if (!run) {
    return [];
  }
  if (props.currentRun?.id === run.id && props.events.length) {
    return props.events;
  }
  return eventsByRunId.value[run.id] || [];
});
const liveEvents = computed(() => (liveRun.value && props.currentRun?.id === liveRun.value.id ? props.events : eventsByRunId.value[liveRun.value?.id || ''] || []));
const liveTranscriptText = computed(() => transcriptTextFromEvents(liveEvents.value));
const selectedTranscriptText = computed(() => transcriptTextFromEvents(selectedEvents.value));
const selectedTranscriptTruncated = computed(() =>
  selectedEvents.value.some((event) => Boolean((event.data as any)?.truncated || (event.data as any)?.rawTruncated))
);
const isLiveControllable = computed(() => Boolean(liveRun.value && liveRun.value.status === 'RUNNING'));
const canReconnect = computed(() => Boolean(liveRun.value?.id && isLiveControllable.value));
const canSendSignal = computed(() => Boolean(liveRun.value?.id && isLiveControllable.value));
const canCancel = computed(() => Boolean(selectedRun.value?.status === 'RUNNING'));
const tokenDetailCount = computed(() => props.tokenUsage?.summary.detailCount || 0);
const activeRunLabel = computed(() => {
  const run = selectedRun.value || liveRun.value;
  return run ? `${runContextLabel(run)} · ${statusLabels[run.status]}` : stageLabels[props.activeStage];
});
const modeFallbackMessage = computed(() => {
  if (props.selectedExecutionMode === 'EMBEDDED_TERMINAL') {
    return '';
  }
  return props.selectedExecutionMode === 'INTERACTIVE_TERMINAL'
    ? '当前选择外部交互终端，页面内保留历史回放。'
    : '当前选择手动复制，页面内保留历史回放。';
});
const connectionStatusText = computed(() => {
  const labels: Record<TerminalSessionStatus, string> = {
    DISCONNECTED: '未连接',
    CONNECTING: '连接中',
    CONNECTED: '已连接',
    RECONNECTING: '重连中',
    READONLY: '只读',
    UNAVAILABLE: '不可用',
    ERROR: '连接异常'
  };
  return labels[props.connectionStatus || 'DISCONNECTED'];
});
const connectionTagType = computed(() => {
  const types: Record<TerminalSessionStatus, 'success' | 'info' | 'warning' | 'danger'> = {
    DISCONNECTED: 'info',
    CONNECTING: 'warning',
    CONNECTED: 'success',
    RECONNECTING: 'warning',
    READONLY: 'info',
    UNAVAILABLE: 'danger',
    ERROR: 'danger'
  };
  return types[props.connectionStatus || 'DISCONNECTED'];
});

function transcriptTextFromEvents(events: RunEvent[]): string {
  const transcriptEvent = [...events].reverse().find((event) => event.type === 'STDOUT' && (event.text || (event.data as any)?.rawText));
  const rawText = (transcriptEvent?.data as any)?.rawText;
  if (typeof rawText === 'string' && rawText) {
    return rawText;
  }
  if (transcriptEvent?.text) {
    return transcriptEvent.text;
  }
  return events.map((event) => event.text || event.message).filter(Boolean).join('\n');
}

function runContextLabel(run: RunRecord): string {
  const stage = run.stage ? stageLabels[run.stage] : stageLabels[props.activeStage];
  const step = run.implementationStep && run.implementationStep in implementationStepLabels
    ? ` / ${implementationStepLabels[run.implementationStep as ImplementationStep]}`
    : '';
  const mode = run.executionMode ? executionModeLabels[run.executionMode] : '';
  return `${stage}${step}${mode ? ` · ${mode}` : ''}`;
}

function runStatusTagType(status: RunStatus): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'SUCCEEDED' || status === 'COMPLETED') {
    return 'success';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'danger';
  }
  if (status === 'RUNNING' || status === 'TERMINAL_OPENED') {
    return 'warning';
  }
  return 'info';
}

function formatRunStartedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function loadRunEvents(runId: string) {
  if (!runId || eventsByRunId.value[runId]) {
    return;
  }
  try {
    eventsByRunId.value = {
      ...eventsByRunId.value,
      [runId]: await apiClient.getRunEvents(props.workflow.requirementId, runId)
    };
  } catch (error: any) {
    ElMessage.warning(error.message || '终端会话日志读取失败');
  }
}

function selectRun(runId: string) {
  selectedRunId.value = runId;
  void loadRunEvents(runId);
}

function handleConnectionStatus(status: TerminalSessionStatus | RunStatus) {
  if (['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'READONLY', 'UNAVAILABLE', 'ERROR'].includes(status)) {
    emit('connection-status', status as TerminalSessionStatus);
  }
}

function handleTerminalError(message: string) {
  ElMessage.warning(message);
}

function reconnectTerminal() {
  livePane.value?.reconnect();
}

function sendCtrlC() {
  livePane.value?.sendSignal('SIGINT');
}

async function copyVisibleTerminal() {
  const text = livePane.value?.copyVisibleText() || selectedTranscriptText.value;
  if (!text) {
    ElMessage.warning('暂无可复制内容');
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  ElMessage.success('终端内容已复制');
}

function openSelectedRunLog() {
  if (selectedRun.value?.id) {
    emit('open-log', selectedRun.value.id);
  }
}

function cancelSelectedRun() {
  if (selectedRun.value?.id) {
    emit('cancel-run', selectedRun.value.id);
  }
}

watch(
  () => liveRun.value?.id || terminalRuns.value[0]?.id || '',
  (runId) => {
    if (!selectedRunId.value && runId) {
      selectedRunId.value = runId;
    }
    if (runId) {
      void loadRunEvents(runId);
    }
  },
  { immediate: true }
);

watch(selectedRunId, (runId) => {
  if (runId) {
    void loadRunEvents(runId);
  }
});
</script>

<style scoped>
.embedded-terminal-workbench {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 640px;
  border: 1px solid #d9e2ef;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.embedded-terminal-workbench.fullscreen {
  position: fixed;
  inset: 16px;
  z-index: 2000;
  min-height: 0;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
}

.terminal-workbench-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid #e3e8f2;
  background: #f8fafc;
}

.terminal-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.terminal-title strong {
  color: #111827;
  font-size: 14px;
}

.terminal-title span {
  color: #64748b;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-toolbar {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.terminal-tabs {
  min-height: 0;
}

.terminal-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
}

.terminal-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.terminal-tab-body {
  display: grid;
  gap: 10px;
  min-height: 0;
  height: 100%;
  padding: 0 12px 12px;
}

.current-terminal-body {
  grid-template-rows: auto minmax(0, 1fr);
}

.history-layout {
  grid-template-columns: 250px minmax(0, 1fr);
}

.history-replay-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.terminal-history-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  overflow: auto;
}

.terminal-history-item {
  display: grid;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  text-align: left;
  cursor: pointer;
}

.terminal-history-item.active {
  border-color: #409eff;
  background: #f0f7ff;
}

.history-row-main,
.history-row-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.history-row-main strong,
.history-row-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-row-meta {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  color: #64748b;
  font-size: 12px;
}

.terminal-empty {
  display: grid;
  place-content: center;
  gap: 8px;
  min-height: 320px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
  text-align: center;
}

.terminal-event-list {
  display: grid;
  align-content: start;
  gap: 8px;
  overflow: auto;
}

.terminal-event-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
}

.terminal-event-row strong {
  display: block;
  color: #334155;
  overflow-wrap: anywhere;
}

.terminal-event-row pre {
  max-height: 180px;
  margin: 6px 0 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.event-level {
  font-size: 12px;
  font-weight: 700;
}

.event-level.info {
  color: #2563eb;
}

.event-level.warn {
  color: #b45309;
}

.event-level.error {
  color: #dc2626;
}

.terminal-inline-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.token-panel {
  align-content: start;
}

.token-metric {
  display: inline-grid;
  gap: 4px;
  max-width: 220px;
  padding: 12px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #f8fafc;
}

.token-metric small,
.muted {
  color: #64748b;
}

.token-metric strong {
  color: #111827;
  font-size: 20px;
}

@media (max-width: 960px) {
  .embedded-terminal-workbench {
    min-height: 560px;
  }

  .history-layout {
    grid-template-columns: 1fr;
  }
}
</style>
