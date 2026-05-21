<template>
  <el-drawer v-model="visible" title="运行日志" size="42%">
    <el-empty v-if="!events.length" description="暂无日志" />
    <el-timeline v-else>
      <el-timeline-item v-for="(event, index) in events" :key="index" :timestamp="event.time" :type="event.level === 'ERROR' ? 'danger' : event.level === 'WARN' ? 'warning' : 'primary'">
        <p>{{ event.message }}</p>
        <pre v-if="event.data">{{ JSON.stringify(event.data, null, 2) }}</pre>
      </el-timeline-item>
    </el-timeline>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { RunEvent } from '@shared/workflow';

defineProps<{
  events: RunEvent[];
}>();

const visible = ref(false);

function open() {
  visible.value = true;
}

defineExpose({ open });
</script>

<style scoped>
pre {
  max-height: 240px;
  overflow: auto;
  padding: 10px;
  border-radius: 6px;
  background: #f5f7fb;
  white-space: pre-wrap;
}
</style>
