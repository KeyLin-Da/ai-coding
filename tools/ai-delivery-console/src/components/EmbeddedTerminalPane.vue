<template>
  <div class="embedded-terminal-pane" :class="{ readonly }">
    <div ref="terminalHost" class="terminal-host" :class="{ active: xtermReady }" />
    <pre v-if="!xtermReady" class="terminal-fallback-output">{{ displayText || emptyText }}</pre>
    <div v-if="loadError && !readonly" class="terminal-fallback-alert">
      {{ loadError }}
    </div>
    <textarea
      v-if="!readonly && !xtermReady"
      v-model="fallbackInput"
      class="terminal-fallback-input"
      spellcheck="false"
      @keydown.enter.exact.prevent="submitFallbackInput"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { RunStatus, TerminalSessionStatus } from '@shared/workflow';
import { TerminalSessionClient } from '@/services/terminal-session-client';

type Disposable = { dispose(): void };
type XtermTerminal = {
  cols: number;
  rows: number;
  open(element: HTMLElement): void;
  write(data: string): void;
  clear(): void;
  focus(): void;
  dispose(): void;
  onData(callback: (data: string) => void): Disposable;
  loadAddon(addon: unknown): void;
};
type FitAddon = {
  fit(): void;
};
type XtermModule = {
  Terminal: new (options: Record<string, unknown>) => XtermTerminal;
};
type FitModule = {
  FitAddon: new () => FitAddon;
};

const props = withDefaults(
  defineProps<{
    runId?: string;
    transcriptText?: string;
    readonly?: boolean;
    autoConnect?: boolean;
  }>(),
  {
    runId: '',
    transcriptText: '',
    readonly: false,
    autoConnect: true
  }
);

const emit = defineEmits<{
  (event: 'status', status: TerminalSessionStatus | RunStatus): void;
  (event: 'error', message: string): void;
  (event: 'output', data: string): void;
}>();

const terminalHost = ref<HTMLElement>();
const xtermReady = ref(false);
const loadError = ref('');
const outputText = ref('');
const fallbackInput = ref('');
const xtermPackageName = '@xterm/xterm';
const fitPackageName = '@xterm/addon-fit';

let terminal: XtermTerminal | undefined;
let fitAddon: FitAddon | undefined;
let inputDisposable: Disposable | undefined;
let resizeObserver: ResizeObserver | undefined;
let client: TerminalSessionClient | undefined;

const displayText = computed(() => outputText.value || props.transcriptText);
const emptyText = computed(() => (props.readonly ? '暂无 transcript' : '等待终端输出'));

async function loadXterm(): Promise<{ Terminal: XtermModule['Terminal']; FitAddon: FitModule['FitAddon'] }> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import(/* @vite-ignore */ xtermPackageName) as Promise<XtermModule>,
    import(/* @vite-ignore */ fitPackageName) as Promise<FitModule>
  ]);
  return { Terminal, FitAddon };
}

async function initializeTerminal() {
  if (!terminalHost.value || terminal || loadError.value) {
    return;
  }
  try {
    const { Terminal, FitAddon } = await loadXterm();
    terminal = new Terminal({
      convertEol: true,
      cursorBlink: !props.readonly,
      disableStdin: props.readonly,
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0b1020',
        foreground: '#dbe7ff',
        cursor: '#f8fafc',
        selectionBackground: '#334155'
      }
    });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHost.value);
    xtermReady.value = true;
    inputDisposable = terminal.onData((data) => {
      if (!props.readonly) {
        client?.sendInput(data);
      }
    });
    if (displayText.value) {
      terminal.write(displayText.value);
    }
    await nextTick();
    fit();
  } catch (error: any) {
    loadError.value = `内嵌终端渲染依赖不可用：${error?.message || 'xterm load failed'}`;
    emit('error', loadError.value);
  }
}

function startClient() {
  if (!props.runId || props.readonly) {
    return;
  }
  client?.close();
  client = new TerminalSessionClient({
    runId: props.runId,
    onOutput: (data) => {
      appendOutput(data);
      emit('output', data);
    },
    onStatus: (status) => emit('status', status),
    onExit: (message) => emit('status', message.status),
    onError: (message) => {
      loadError.value = message;
      emit('error', message);
    }
  });
  client.connect();
}

function appendOutput(data: string) {
  outputText.value += data;
  terminal?.write(data);
}

function resetOutput(value = props.transcriptText) {
  outputText.value = value || '';
  if (terminal) {
    terminal.clear();
    if (outputText.value) {
      terminal.write(outputText.value);
    }
  }
}

function fit() {
  if (!terminalHost.value) {
    return;
  }
  fitAddon?.fit();
  if (!props.readonly && terminal) {
    client?.resize(terminal.cols, terminal.rows);
  }
}

function reconnect() {
  if (!props.runId || props.readonly) {
    return;
  }
  loadError.value = '';
  client?.reconnect();
}

function sendSignal(signal: 'SIGINT') {
  client?.signal(signal);
}

function submitFallbackInput() {
  const value = fallbackInput.value;
  if (!value) {
    return;
  }
  client?.sendInput(`${value}\n`);
  appendOutput(`${value}\n`);
  fallbackInput.value = '';
}

function copyVisibleText(): string {
  return displayText.value;
}

function focus() {
  terminal?.focus();
  terminalHost.value?.focus();
}

function dispose() {
  client?.close();
  client = undefined;
  inputDisposable?.dispose();
  inputDisposable = undefined;
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  terminal?.dispose();
  terminal = undefined;
  fitAddon = undefined;
  xtermReady.value = false;
}

watch(
  () => props.transcriptText,
  (value) => {
    if (props.readonly) {
      resetOutput(value);
    }
  }
);

watch(
  () => props.runId,
  async () => {
    dispose();
    loadError.value = '';
    resetOutput('');
    await initializeTerminal();
    if (props.autoConnect) {
      startClient();
    }
  }
);

onMounted(async () => {
  resetOutput();
  await initializeTerminal();
  if (terminalHost.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(terminalHost.value);
  }
  if (props.autoConnect) {
    startClient();
  }
});

onBeforeUnmount(() => {
  dispose();
});

defineExpose({
  reconnect,
  sendSignal,
  copyVisibleText,
  focus,
  fit
});
</script>

<style scoped>
.embedded-terminal-pane {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  min-height: 0;
  height: 100%;
  border: 1px solid #172033;
  border-radius: 8px;
  background: #0b1020;
  overflow: hidden;
}

.terminal-host {
  display: none;
  min-width: 0;
  min-height: 0;
  padding: 8px;
}

.terminal-host.active {
  display: block;
}

.terminal-fallback-output {
  min-height: 240px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: #dbe7ff;
  background: #0b1020;
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.terminal-fallback-alert {
  padding: 8px 12px;
  border-top: 1px solid #283449;
  color: #fbbf24;
  background: #121a2b;
  font-size: 12px;
}

.terminal-fallback-input {
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-top: 1px solid #283449;
  outline: none;
  color: #e5edff;
  background: #111827;
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  resize: vertical;
}
</style>
