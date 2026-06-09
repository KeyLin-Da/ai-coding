<template>
  <div class="app-shell">
    <header class="top-bar">
      <div>
        <p class="eyebrow">OpenSpec Delivery Console</p>
        <h1>AI 需求交付控制台</h1>
      </div>
      <div class="top-actions">
        <el-button v-if="auth.isAuthenticated" :icon="FolderOpened" @click="$router.push('/projects')">
          {{ project.current?.name || '项目' }}
        </el-button>
        <el-button
          v-if="auth.isAuthenticated && project.current"
          :icon="Refresh"
          :loading="syncingRepo"
          @click="syncRepo"
        >
          同步 Git 仓
        </el-button>
        <el-button v-if="auth.isAuthenticated" :icon="User" @click="$router.push('/settings')">
          {{ auth.user?.displayName || '个人中心' }}
        </el-button>
        <el-button v-if="auth.isAuthenticated" :icon="Refresh" :loading="refreshing" @click="refresh">刷新</el-button>
      </div>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { FolderOpened, Refresh, User } from '@element-plus/icons-vue';
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute } from 'vue-router';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useWorkflowStore } from '@/stores/workflow';

const route = useRoute();
const auth = useAuthStore();
const project = useProjectStore();
const store = useWorkflowStore();
const refreshing = ref(false);
const syncingRepo = ref(false);

async function refresh() {
  refreshing.value = true;
  try {
    if (route.name === 'requirement-detail' && typeof route.params.requirementId === 'string') {
      await store.loadRequirement(route.params.requirementId);
      return;
    }
    await store.loadRequirements();
  } finally {
    refreshing.value = false;
  }
}

async function syncRepo() {
  if (!project.current) {
    return;
  }
  syncingRepo.value = true;
  try {
    await apiClient.syncProjectRepository(project.current.id);
    await refresh();
    ElMessage.success('Git 仓已同步');
  } catch (error: any) {
    ElMessage.error(error.message || '同步 Git 仓失败');
  } finally {
    syncingRepo.value = false;
  }
}
</script>
