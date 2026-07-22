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
    <main
      class="app-main"
      :class="{ 'with-project-nav': showProjectNav, 'project-nav-collapsed': showProjectNav && projectNavCollapsed }"
    >
      <aside v-if="showProjectNav" class="project-nav" :class="{ collapsed: projectNavCollapsed }" aria-label="项目导航">
        <div class="project-nav-toggle-row">
          <el-button
            class="project-nav-toggle"
            circle
            :icon="projectNavCollapsed ? Expand : Fold"
            :title="projectNavCollapsed ? '展开左侧菜单' : '收起左侧菜单'"
            :aria-label="projectNavCollapsed ? '展开左侧菜单' : '收起左侧菜单'"
            @click="toggleProjectNav"
          />
        </div>
        <el-menu :default-active="activeMenu" class="project-menu" :collapse="projectNavCollapsed" router>
          <el-menu-item index="/">
            <el-icon><List /></el-icon>
            <span>需求工作流</span>
          </el-menu-item>
          <el-sub-menu index="memory">
            <template #title>
              <el-icon><Collection /></el-icon>
              <span>项目记忆</span>
              <el-badge v-if="pendingMemoryCount && !projectNavCollapsed" class="nav-badge" :value="pendingMemoryCount" />
            </template>
            <el-menu-item index="/memory">经验库</el-menu-item>
            <el-menu-item index="/memory/candidates">
              <span>待确认经验</span>
              <el-badge v-if="pendingMemoryCount" class="nav-badge inline" :value="pendingMemoryCount" />
            </el-menu-item>
            <el-menu-item index="/memory/recalls">召回记录</el-menu-item>
            <el-menu-item index="/memory/archived">过期/废弃</el-menu-item>
          </el-sub-menu>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>项目设置</span>
          </el-menu-item>
        </el-menu>
      </aside>
      <section class="app-content">
        <router-view />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { Collection, Expand, FolderOpened, Fold, List, Refresh, Setting, User } from '@element-plus/icons-vue';
import { computed, onMounted, ref, watch } from 'vue';
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
const pendingMemoryCount = ref(0);
const projectNavCollapsedStorageKey = 'ai-delivery-console:project-nav-collapsed';

function readProjectNavCollapsed() {
  try {
    return window.localStorage.getItem(projectNavCollapsedStorageKey) === '1';
  } catch {
    return false;
  }
}

const projectNavCollapsed = ref(readProjectNavCollapsed());

const showProjectNav = computed(() => {
  if (!auth.isAuthenticated || !project.current || route.meta.public) {
    return false;
  }
  return !['login', 'projects', 'public-artifact-preview'].includes(String(route.name));
});

const activeMenu = computed(() => {
  if (String(route.path).startsWith('/memory/candidates')) {
    return '/memory/candidates';
  }
  if (String(route.path).startsWith('/memory/recalls')) {
    return '/memory/recalls';
  }
  if (String(route.path).startsWith('/memory/archived')) {
    return '/memory/archived';
  }
  if (String(route.path).startsWith('/memory')) {
    return '/memory';
  }
  if (String(route.path).startsWith('/settings')) {
    return '/settings';
  }
  return '/';
});

async function loadPendingMemoryCount() {
  if (!project.current) {
    pendingMemoryCount.value = 0;
    return;
  }
  try {
    const page = await apiClient.listMemoryCandidates({
      projectId: String(project.current.id),
      status: ['PENDING_CONFIRM', 'PENDING_VERIFY'],
      pageSize: 1
    });
    pendingMemoryCount.value = page.total;
  } catch {
    pendingMemoryCount.value = 0;
  }
}

async function refresh() {
  refreshing.value = true;
  try {
    if (route.name === 'requirement-detail' && typeof route.params.requirementId === 'string') {
      await store.loadRequirement(route.params.requirementId);
      return;
    }
    await store.loadRequirements();
    await loadPendingMemoryCount();
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

function toggleProjectNav() {
  projectNavCollapsed.value = !projectNavCollapsed.value;
  try {
    window.localStorage.setItem(projectNavCollapsedStorageKey, projectNavCollapsed.value ? '1' : '0');
  } catch {
    // localStorage 不可用时忽略，当前会话内仍可正常折叠。
  }
}

onMounted(loadPendingMemoryCount);
watch(() => project.current?.id, loadPendingMemoryCount);
watch(() => route.fullPath, () => {
  if (showProjectNav.value) {
    loadPendingMemoryCount();
  }
});
</script>

<style scoped>
.app-main.with-project-nav {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.app-main.with-project-nav.project-nav-collapsed {
  grid-template-columns: 64px minmax(0, 1fr);
}

.project-nav {
  position: sticky;
  top: 16px;
  width: 224px;
  min-width: 0;
}

.project-nav.collapsed {
  width: 64px;
}

.project-nav-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.project-nav.collapsed .project-nav-toggle-row {
  justify-content: center;
}

.project-nav-toggle {
  flex: 0 0 auto;
}

.project-menu {
  width: 100%;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  overflow: hidden;
}

.project-menu.el-menu--collapse {
  width: 64px;
}

.app-content {
  min-width: 0;
}

.nav-badge {
  margin-left: 8px;
}

.nav-badge.inline {
  margin-left: auto;
}

@media (max-width: 960px) {
  .app-main.with-project-nav {
    grid-template-columns: 1fr;
  }

  .app-main.with-project-nav.project-nav-collapsed {
    grid-template-columns: 1fr;
  }

  .project-nav {
    position: static;
    width: 100%;
  }

  .project-nav.collapsed {
    width: 64px;
  }
}
</style>
