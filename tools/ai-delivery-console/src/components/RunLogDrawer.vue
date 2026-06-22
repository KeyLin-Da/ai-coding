<template>
  <el-drawer v-model="visible" :title="drawerTitle" :size="drawerSize" :with-header="true">
    <template #header>
      <div class="drawer-header">
        <span class="drawer-title">运行日志</span>
        <el-button 
          :icon="isFullscreen ? Minus : FullScreen" 
          size="small" 
          circle
          @click="toggleFullscreen"
          :title="isFullscreen ? '退出全屏' : '全屏'"
        />
      </div>
    </template>
    <el-empty v-if="!hasContent" description="暂无日志" />
    <div v-else class="run-log-content">
      <section class="usage-panel">
        <div class="usage-summary">
          <span>
            <small>本次 Token</small>
            <strong>{{ formatTokenCount(displayUsage.summary.totalTokens) }}</strong>
          </span>
          <span>
            <small>输入</small>
            <strong>{{ formatTokenCount(displayUsage.summary.inputTokens) }}</strong>
          </span>
          <span>
            <small>输出</small>
            <strong>{{ formatTokenCount(displayUsage.summary.outputTokens) }}</strong>
          </span>
          <span>
            <small>推理输出</small>
            <strong>{{ formatTokenCount(displayUsage.summary.reasoningOutputTokens) }}</strong>
          </span>
          <em>{{ displayUsage.summary.detailCount ? `明细 ${displayUsage.summary.detailCount} 条` : '暂无 token 用量' }}</em>
        </div>
      </section>
      <div v-if="terminalEvents.length" class="terminal">
        <div v-for="(event, index) in terminalEvents" :key="index" class="terminal-line" :class="event.level.toLowerCase()">
          <span class="time">{{ event.time }}</span>
          <span class="type">{{ event.type || event.level }}</span>
          <div class="log-message">
            <pre>{{ event.text || event.message }}</pre>
            <small v-if="truncatedRef(event)">truncated {{ truncatedRef(event) }}</small>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无运行日志" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { FullScreen, Minus } from '@element-plus/icons-vue';
import type { RunEvent, RunTokenUsageDetail, RunTokenUsageRun } from '@shared/workflow';
import { emptyTokenUsageSummary } from '@shared/workflow';

const props = defineProps<{
  events: RunEvent[];
  usage?: RunTokenUsageRun;
}>();

const visible = ref(false);
const isFullscreen = ref(false);

const drawerSize = computed(() => isFullscreen.value ? '100%' : '42%');
const drawerTitle = computed(() => isFullscreen.value ? '运行日志（全屏）' : '运行日志');
const derivedUsage = computed<RunTokenUsageRun>(() => {
  const details: RunTokenUsageDetail[] = props.events.flatMap((event, index) => {
    const data = event.data as
      | {
          kind?: string;
          sourceEventType?: string;
          model?: string;
          usageFingerprint?: string;
          usage?: {
            inputTokens?: number;
            cachedInputTokens?: number;
            outputTokens?: number;
            reasoningOutputTokens?: number;
            totalTokens?: number;
          };
        }
      | undefined;
    if (data?.kind !== 'TOKEN_USAGE' || !data.usage) {
      return [];
    }
    const inputTokens = data.usage.inputTokens || 0;
    const outputTokens = data.usage.outputTokens || 0;
    return [
      {
        id: index,
        runId: props.usage?.runId || 'local',
        agentId: event.agentId,
        model: data.model,
        sourceEventType: data.sourceEventType || 'turn.completed',
        usageFingerprint: data.usageFingerprint,
        inputTokens,
        cachedInputTokens: data.usage.cachedInputTokens || 0,
        outputTokens,
        reasoningOutputTokens: data.usage.reasoningOutputTokens || 0,
        totalTokens: data.usage.totalTokens || inputTokens + outputTokens,
        rawUsageJson: event.text,
        occurredAt: event.time,
        createdAt: event.time
      }
    ];
  });
  const summary = emptyTokenUsageSummary(props.usage?.runId);
  for (const detail of details) {
    summary.totalTokens += detail.totalTokens;
    summary.inputTokens += detail.inputTokens;
    summary.cachedInputTokens += detail.cachedInputTokens;
    summary.outputTokens += detail.outputTokens;
    summary.reasoningOutputTokens += detail.reasoningOutputTokens;
    summary.detailCount += 1;
  }
  summary.runCount = details.length ? 1 : 0;
  return {
    runId: props.usage?.runId || 'local',
    summary,
    details
  };
});
const displayUsage = computed(() => {
  if (props.usage && (props.usage.details.length || props.usage.summary.detailCount)) {
    return props.usage;
  }
  return derivedUsage.value;
});
const terminalEvents = computed(() => props.events.filter((event) => {
  const data = event.data as { kind?: string } | undefined;
  return data?.kind !== 'TOKEN_USAGE';
}));
const hasContent = computed(() => Boolean(props.events.length || displayUsage.value.summary.detailCount));

function open() {
  visible.value = true;
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
}

function truncatedRef(event: RunEvent): string {
  const data = event.data as { truncated?: boolean; originalLength?: string | number } | undefined;
  return data?.truncated && data.originalLength ? String(data.originalLength) : '';
}

function formatTokenCount(value?: number) {
  const count = value || 0;
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

defineExpose({ open });
</script>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.drawer-title {
  font-size: 16px;
  font-weight: 500;
}

.run-log-content {
  display: grid;
  gap: 12px;
}

.usage-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.usage-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.usage-summary span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
}

.usage-summary small {
  color: #64748b;
}

.usage-summary strong {
  color: #172033;
  font-weight: 650;
}

.usage-summary em {
  color: #64748b;
  font-size: 12px;
  font-style: normal;
}

.terminal {
  min-height: 420px;
  padding: 12px;
  border-radius: 8px;
  background: #0e1726;
  color: #dbeafe;
  font-family: "SFMono-Regular", Consolas, monospace;
  overflow: auto;
}

.terminal-line {
  display: grid;
  grid-template-columns: 170px 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 3px 0;
}

.terminal-line.warn {
  color: #fde68a;
}

.terminal-line.error {
  color: #fecaca;
}

.time,
.type {
  color: #93a4bd;
  font-size: 12px;
}

pre {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-message {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.log-message small {
  color: #93c5fd;
}

@media (max-width: 760px) {
  .terminal-line {
    grid-template-columns: 1fr;
  }
}
</style>
