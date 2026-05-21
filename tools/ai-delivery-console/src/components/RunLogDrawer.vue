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
    <el-empty v-if="!events.length" description="暂无日志" />
    <div v-else class="terminal">
      <div v-for="(event, index) in events" :key="index" class="terminal-line" :class="event.level.toLowerCase()">
        <span class="time">{{ event.time }}</span>
        <span class="type">{{ event.type || event.level }}</span>
        <pre>{{ event.text || event.message }}</pre>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { FullScreen, Minus } from '@element-plus/icons-vue';
import type { RunEvent } from '@shared/workflow';

defineProps<{
  events: RunEvent[];
}>();

const visible = ref(false);
const isFullscreen = ref(false);

const drawerSize = computed(() => isFullscreen.value ? '100%' : '42%');
const drawerTitle = computed(() => isFullscreen.value ? '运行日志（全屏）' : '运行日志');

function open() {
  visible.value = true;
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
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

@media (max-width: 760px) {
  .terminal-line {
    grid-template-columns: 1fr;
  }
}
</style>
