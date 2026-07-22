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
      <section v-if="terminalEvents.length" class="log-toolbar">
        <input v-model.trim="searchKeyword" class="log-search" placeholder="搜索日志" />
        <select v-model="levelFilter" class="log-filter">
          <option value="ALL">全部</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="STDOUT">STDOUT</option>
          <option value="STDERR">STDERR</option>
        </select>
        <label class="auto-scroll">
          <input v-model="autoScroll" type="checkbox" />
          自动滚动
        </label>
        <button class="copy-button" :disabled="!displayTerminalEvents.length" @click="copyVisibleLogs">复制可见日志</button>
        <span class="log-count">
          {{ displayTerminalEvents.length }}/{{ mergedTerminalEvents.length }} 段
          <template v-if="mergedTerminalEvents.length !== terminalEvents.length">，已合并 {{ terminalEvents.length }} 条</template>
        </span>
        <span v-if="copyStatus" class="copy-status">{{ copyStatus }}</span>
      </section>
      <div v-if="displayTerminalEvents.length" ref="terminalRef" class="terminal">
        <div v-for="event in displayTerminalEvents" :key="event.id" class="terminal-line" :class="[event.level.toLowerCase(), event.tone]">
          <span class="time">{{ event.time }}</span>
          <span class="type">
            {{ event.title || event.type || event.level }}
            <small v-if="event.count > 1">×{{ event.count }}</small>
          </span>
          <div class="log-message">
            <div v-if="event.command" class="log-command">$ {{ event.command }}</div>
            <pre>{{ event.text }}</pre>
            <small v-if="truncatedRef(event.original)">truncated {{ truncatedRef(event.original) }}</small>
          </div>
        </div>
      </div>
      <el-empty v-else-if="terminalEvents.length" description="没有匹配的运行日志" />
      <el-empty v-else description="暂无运行日志" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { FullScreen, Minus } from '@element-plus/icons-vue';
import type { RunEvent, RunTokenUsageDetail, RunTokenUsageRun } from '@shared/workflow';
import { emptyTokenUsageSummary } from '@shared/workflow';

type LogLevelFilter = 'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'STDOUT' | 'STDERR';
type LogTone = 'tone-info' | 'tone-success' | 'tone-warn' | 'tone-error' | 'tone-muted';

interface DisplayRunEvent {
  id: string;
  time: string;
  type: string;
  level: string;
  title: string;
  text: string;
  rawText: string;
  command: string;
  tone: LogTone;
  count: number;
  mergeKey: string;
  original: RunEvent;
}

interface FormattedLogText {
  title: string;
  text: string;
  command: string;
  tone: LogTone;
}

const props = defineProps<{
  events: RunEvent[];
  usage?: RunTokenUsageRun;
}>();

const visible = ref(false);
const isFullscreen = ref(false);
const searchKeyword = ref('');
const levelFilter = ref<LogLevelFilter>('ALL');
const autoScroll = ref(true);
const terminalRef = ref<HTMLElement | null>(null);
const copyStatus = ref('');

const drawerSize = computed(() => isFullscreen.value ? '100%' : '72%');
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
const mergedTerminalEvents = computed<DisplayRunEvent[]>(() => {
  const merged: DisplayRunEvent[] = [];
  for (const event of terminalEvents.value) {
    const type = event.type || event.level || 'INFO';
    const level = event.level || 'INFO';
    const rawText = event.text || event.message || '';
    const data = event.data as { transcriptPath?: string } | undefined;
    const outputType = ['STDOUT', 'STDERR'].includes(type);
    const mergeKey = outputType ? `${type}:${level}:${data?.transcriptPath || 'default'}` : '';
    const previous = merged[merged.length - 1];
    if (outputType && previous?.mergeKey === mergeKey) {
      previous.rawText = appendLogText(previous.rawText, rawText);
      const formatted = formatLogText(previous.rawText, type, level);
      previous.title = formatted.title;
      previous.text = formatted.text;
      previous.command = formatted.command;
      previous.tone = formatted.tone;
      previous.count += 1;
      previous.original = event;
      continue;
    }
    const formatted = formatLogText(rawText, type, level);
    merged.push({
      id: `${merged.length}-${event.time}-${type}`,
      time: event.time,
      type,
      level,
      title: formatted.title,
      text: formatted.text,
      rawText,
      command: formatted.command,
      tone: formatted.tone,
      count: 1,
      mergeKey,
      original: event
    });
  }
  return merged;
});
const displayTerminalEvents = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  return mergedTerminalEvents.value.filter((event) => {
    const matchesLevel =
      levelFilter.value === 'ALL' ||
      event.level === levelFilter.value ||
      event.type === levelFilter.value;
    const matchesKeyword =
      !keyword ||
      event.text.toLowerCase().includes(keyword) ||
      event.title.toLowerCase().includes(keyword) ||
      event.command.toLowerCase().includes(keyword) ||
      event.type.toLowerCase().includes(keyword) ||
      event.level.toLowerCase().includes(keyword);
    return matchesLevel && matchesKeyword;
  });
});
const visibleLogText = computed(() =>
  displayTerminalEvents.value
    .map((event) => `[${event.time}] ${event.title || event.type || event.level}${event.command ? `\n$ ${event.command}` : ''}\n${event.text}`)
    .join('\n\n')
);
const hasContent = computed(() => Boolean(props.events.length || displayUsage.value.summary.detailCount));

watch(displayTerminalEvents, async () => {
  if (!autoScroll.value) {
    return;
  }
  await nextTick();
  if (terminalRef.value) {
    terminalRef.value.scrollTop = terminalRef.value.scrollHeight;
  }
}, { flush: 'post' });

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

function appendLogText(current: string, next: string): string {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return `${current.replace(/\n*$/, '')}\n${next.replace(/^\n*/, '')}`;
}

function formatLogText(rawText: string, type: string, level: string): FormattedLogText {
  const codex = formatCodexJsonl(rawText);
  if (codex) {
    return codex;
  }
  return {
    title: type || level,
    text: normalizeVisibleText(rawText),
    command: '',
    tone: toneFor(type, level)
  };
}

function formatCodexJsonl(rawText: string): FormattedLogText | undefined {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return undefined;
  }
  const chunks: string[] = [];
  let command = '';
  let title = 'CODEx';
  let tone: LogTone = 'tone-info';
  let parsedCount = 0;

  for (const line of lines) {
    const value = parseJsonObject(line);
    if (!value || typeof value.type !== 'string') {
      if (parsedCount) {
        chunks.push(normalizeVisibleText(line));
      }
      continue;
    }
    parsedCount += 1;
    const eventType = value.type;
    if (eventType === 'error') {
      title = 'ERROR';
      tone = 'tone-error';
      chunks.push(String(value.message || value.error || 'Codex 执行错误'));
      continue;
    }
    const item = value.item && typeof value.item === 'object' ? value.item as Record<string, any> : undefined;
    if (!item) {
      if (eventType.includes('reconnect') || eventType.includes('timeout')) {
        title = 'WARN';
        tone = 'tone-warn';
        chunks.push(String(value.message || eventType));
      }
      continue;
    }
    const itemType = String(item.type || eventType);
    const status = String(item.status || '').toUpperCase();
    if (status === 'FAILED' || itemType === 'error') {
      tone = 'tone-error';
    } else if (status === 'COMPLETED') {
      tone = tone === 'tone-error' ? tone : 'tone-success';
    }
    if (item.command && !command) {
      command = String(item.command);
    }
    if (eventType === 'item.started') {
      title = itemType;
      chunks.push(`开始 ${itemType}${item.id ? ` · ${item.id}` : ''}`);
      continue;
    }
    if (eventType === 'item.completed') {
      title = itemType;
      const exitCode = item.exit_code == null ? '' : ` · exit ${item.exit_code}`;
      const header = `${status || 'COMPLETED'} ${itemType}${item.id ? ` · ${item.id}` : ''}${exitCode}`;
      const output = normalizeVisibleText(String(item.aggregated_output || item.text || item.message || ''));
      chunks.push(output ? `${header}\n${output}` : header);
      continue;
    }
    const output = normalizeVisibleText(String(item.aggregated_output || item.text || item.message || ''));
    chunks.push(output || `${eventType} ${itemType}`);
  }

  if (!parsedCount) {
    return undefined;
  }
  return {
    title,
    text: chunks.filter(Boolean).join('\n\n').trim() || `${parsedCount} 条 Codex 事件`,
    command,
    tone
  };
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function parseJsonObject(value: string): Record<string, any> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : undefined;
  } catch {
    return undefined;
  }
}

function toneFor(type: string, level: string): LogTone {
  const marker = `${type}:${level}`.toUpperCase();
  if (marker.includes('ERROR') || marker.includes('STDERR')) {
    return 'tone-error';
  }
  if (marker.includes('WARN')) {
    return 'tone-warn';
  }
  if (marker.includes('EXIT') || marker.includes('START')) {
    return 'tone-success';
  }
  return 'tone-info';
}

async function copyVisibleLogs() {
  if (!visibleLogText.value) {
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(visibleLogText.value);
    } else {
      fallbackCopyText(visibleLogText.value);
    }
    copyStatus.value = '已复制';
  } catch {
    copyStatus.value = '复制失败';
  }
  window.setTimeout(() => {
    copyStatus.value = '';
  }, 1800);
}

function fallbackCopyText(text: string) {
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

.log-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 0;
  background: #fff;
}

.log-search,
.log-filter {
  height: 30px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #fff;
  color: #172033;
  font-size: 13px;
}

.log-search {
  width: min(320px, 100%);
  padding: 0 10px;
}

.log-filter {
  padding: 0 8px;
}

.auto-scroll {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #475569;
  font-size: 13px;
}

.copy-button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid #bfd1e8;
  border-radius: 6px;
  background: #f8fafc;
  color: #25415f;
  cursor: pointer;
}

.copy-button:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

.log-count,
.copy-status {
  color: #64748b;
  font-size: 12px;
}

.terminal {
  height: calc(100vh - 210px);
  min-height: 460px;
  padding: 14px;
  border-radius: 8px;
  background: #0b1220;
  color: #d8e7ff;
  font-family: "SFMono-Regular", Consolas, monospace;
  overflow: auto;
}

.terminal-line {
  display: grid;
  grid-template-columns: 168px 138px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.terminal-line:last-child {
  border-bottom: 0;
}

.terminal-line.tone-success {
  color: #d6f7df;
}

.terminal-line.tone-warn,
.terminal-line.warn {
  color: #ffe8a3;
}

.terminal-line.tone-error,
.terminal-line.error {
  color: #ffd0d0;
}

.terminal-line.tone-muted {
  color: #a9b7cc;
}

.time,
.type {
  color: #8ba0ba;
  font-size: 12px;
  line-height: 1.45;
}

.type {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: start;
  width: fit-content;
  max-width: 100%;
  padding: 2px 7px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  color: #c7d2fe;
  overflow-wrap: anywhere;
}

.type small {
  color: #c4b5fd;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: normal;
  overflow-wrap: anywhere;
  line-height: 1.55;
  tab-size: 2;
}

.log-message {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.log-command {
  width: fit-content;
  max-width: 100%;
  padding: 5px 8px;
  border: 1px solid rgba(34, 211, 238, 0.2);
  border-radius: 6px;
  background: rgba(8, 47, 73, 0.45);
  color: #7dd3fc;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.log-message small {
  color: #93c5fd;
}

@media (max-width: 760px) {
  .log-toolbar {
    align-items: stretch;
  }

  .log-search,
  .log-filter,
  .copy-button {
    width: 100%;
  }

  .terminal {
    height: calc(100vh - 250px);
    min-height: 360px;
  }

  .terminal-line {
    grid-template-columns: 1fr;
  }
}
</style>
