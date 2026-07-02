<template>
  <section class="workspace-band project-page">
    <div class="toolbar">
      <div>
        <strong>项目列表</strong>
        <p class="muted">选择一个项目后进入需求列表，本地工程目录会按用户和项目私有保存。</p>
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Link" @click="joinVisible = true">加入项目</el-button>
        <el-button type="primary" :icon="Plus" @click="createVisible = true">创建项目</el-button>
      </div>
    </div>

    <el-table :data="project.projects" v-loading="project.loading" style="width: 100%">
      <el-table-column prop="name" label="项目名" min-width="220" />
      <el-table-column prop="code" label="项目码" min-width="180" />
      <el-table-column label="产物仓" min-width="260">
        <template #default="{ row }">
          <span class="repo-url">{{ row.repository?.repoUrl || '未配置' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="role" label="角色" width="120" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" :loading="selectingProjectId === row.id" @click="select(row)">进入</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!project.loading && !project.projects.length" description="暂无项目" />
  </section>

  <el-dialog v-model="createVisible" title="创建项目" width="420px">
    <el-form label-position="top">
      <el-form-item label="项目名" required>
        <el-input v-model="createName" placeholder="例如 OPP需求交付" @keyup.enter="createProject" />
      </el-form-item>
      <el-form-item label="Git 平台" required>
        <el-select v-model="createRepoProvider" style="width: 100%">
          <el-option label="GitLab" value="GITLAB" />
          <el-option label="GitHub" value="GITHUB" />
          <el-option label="Gitee" value="GITEE" />
          <el-option label="项目 Git" value="PROJECT_GIT" />
          <el-option label="其他" value="OTHER" />
        </el-select>
      </el-form-item>
      <el-form-item label="AI 产物 Git 仓" required>
        <el-input v-model="createRepoUrl" placeholder="git@git.example.com:opp/ai-delivery-artifacts.git" />
      </el-form-item>
      <el-form-item label="默认分支">
        <el-input v-model="createDefaultBranch" placeholder="master" @keyup.enter="createProject" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createVisible = false">取消</el-button>
      <el-button type="primary" :loading="creatingProject" @click="createProject">创建</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="joinVisible" title="加入项目" width="420px">
    <el-form label-position="top">
      <el-form-item label="项目码" required>
        <el-input v-model="joinCode" placeholder="输入项目码或邀请码" @keyup.enter="joinProject" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="joinVisible = false">取消</el-button>
      <el-button type="primary" :loading="joiningProject" @click="joinProject">加入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Link, Plus } from '@element-plus/icons-vue';
import { apiClient, type DeliveryProjectVO, type ProjectRepoSyncStatus } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const project = useProjectStore();
const settings = useSettingsStore();
const createVisible = ref(false);
const joinVisible = ref(false);
const createName = ref('');
const createRepoProvider = ref('GITLAB');
const createRepoUrl = ref('');
const createDefaultBranch = ref('master');
const joinCode = ref('');
const creatingProject = ref(false);
const joiningProject = ref(false);
const selectingProjectId = ref<string | number>('');

async function createProject() {
  const name = createName.value.trim();
  if (!name) {
    ElMessage.warning('请填写项目名');
    return;
  }
  const repoUrl = createRepoUrl.value.trim();
  if (!repoUrl) {
    ElMessage.warning('请填写 AI 产物 Git 仓地址');
    return;
  }
  creatingProject.value = true;
  try {
    await project.createProject({
      name,
      repository: {
        provider: createRepoProvider.value,
        repoUrl,
        defaultBranch: createDefaultBranch.value.trim() || 'master'
      }
    });
    await maybeMigrateLegacyMappings();
    if (project.current) {
      await notifyRepoStatus(project.current.id);
    }
    createVisible.value = false;
    createName.value = '';
    createRepoProvider.value = 'GITLAB';
    createRepoUrl.value = '';
    createDefaultBranch.value = 'master';
    router.push({ name: 'requirements' });
  } catch (error: any) {
    ElMessage.error(error.message || '创建失败');
  } finally {
    creatingProject.value = false;
  }
}

async function joinProject() {
  const code = joinCode.value.trim();
  if (!code) {
    ElMessage.warning('请填写项目码');
    return;
  }
  joiningProject.value = true;
  try {
    await project.joinProject(code);
    await maybeMigrateLegacyMappings();
    if (project.current) {
      await notifyRepoStatus(project.current.id);
    }
    joinVisible.value = false;
    joinCode.value = '';
    router.push({ name: 'requirements' });
  } catch (error: any) {
    ElMessage.error(error.message || '加入失败');
  } finally {
    joiningProject.value = false;
  }
}

async function select(row: DeliveryProjectVO) {
  selectingProjectId.value = row.id;
  try {
    await project.selectProject(row);
    await notifyRepoStatus(row.id);
    await maybeMigrateLegacyMappings();
    router.push({ name: 'requirements' });
  } catch (error: any) {
    ElMessage.error(error.message || '进入项目失败');
  } finally {
    selectingProjectId.value = '';
  }
}

function repoStatusText(status?: ProjectRepoSyncStatus): string {
  const labels: Record<ProjectRepoSyncStatus, string> = {
    NOT_CLONED: '项目产物仓尚未 clone',
    READY: '项目产物仓已就绪',
    BEHIND_REMOTE: '本地项目产物仓落后远端',
    DIRTY: '项目产物仓存在未同步变更',
    CONFLICTING: '项目产物仓存在冲突',
    PUSHING: '项目产物仓推送中',
    PUSHED: '项目产物仓已推送',
    FAILED: '项目产物仓检查失败'
  };
  return status ? labels[status] || status : '项目产物仓状态未知';
}

async function notifyRepoStatus(projectId: string | number) {
  try {
    await settings.requireClientSessionId();
    const state = await apiClient.getProjectRepositoryStatus(projectId);
    if (state.syncStatus === 'READY' || state.syncStatus === 'PUSHED') {
      return;
    }
    ElMessage.warning(repoStatusText(state.syncStatus));
  } catch (error: any) {
    ElMessage.warning(error.message || '无法检查项目产物仓状态');
  }
}

onMounted(() => {
  void project.loadProjects();
});

async function maybeMigrateLegacyMappings() {
  const legacyPaths = [...new Set(settings.desktopConfig.workspaceMappings.map((item) => item.localPath).filter(Boolean))];
  if (!legacyPaths.length || project.workspaceMappings.length) {
    return;
  }
  try {
    await ElMessageBox.confirm('检测到旧版本机工程目录配置，是否迁入当前项目的私有目录？', '迁移工程目录', {
      type: 'info',
      confirmButtonText: '迁入',
      cancelButtonText: '跳过'
    });
    for (const localPath of legacyPaths) {
      await project.addWorkspaceMapping(localPath);
    }
    ElMessage.success('工程目录已迁入当前项目');
  } catch {
    // 用户跳过迁移，不影响进入项目。
  }
}
</script>

<style scoped>
.project-page {
  min-height: 420px;
}

.repo-url {
  word-break: break-all;
}
</style>
