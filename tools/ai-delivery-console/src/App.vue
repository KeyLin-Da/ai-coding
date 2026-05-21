<template>
  <div class="app-shell">
    <header class="top-bar">
      <div>
        <p class="eyebrow">OpenSpec Delivery Console</p>
        <h1>AI 需求交付控制台</h1>
      </div>
      <el-button :icon="Refresh" @click="refresh">刷新</el-button>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import { useRoute } from 'vue-router';
import { useWorkflowStore } from '@/stores/workflow';

const route = useRoute();
const store = useWorkflowStore();

function refresh() {
  if (route.name === 'requirement-detail' && typeof route.params.requirementId === 'string') {
    store.loadRequirement(route.params.requirementId);
    return;
  }
  store.loadRequirements();
}
</script>
