<template>
  <section class="settings-page">
    <div class="toolbar">
      <div>
        <strong>个人中心</strong>
        <p class="muted">{{ auth.user?.account }} · {{ project.current?.name || '未选择项目' }}</p>
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Back" @click="goBack">返回</el-button>
        <el-button type="danger" plain @click="logout">退出登录</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="个人资料" name="profile">
        <el-card>
          <el-form label-width="110px" label-position="left">
            <el-form-item label="用户账号">
              <el-input :model-value="auth.user?.account" disabled />
            </el-form-item>
            <el-form-item label="展示名称">
              <el-input v-model="profileName" placeholder="协作展示名称" />
            </el-form-item>
          </el-form>
          <div class="table-actions">
            <el-button type="primary" :loading="saving" @click="saveProfile">保存资料</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="交付工作区" name="delivery">
        <el-card>
          <template #header>
            <span>本机全局交付工作区</span>
          </template>
          <el-alert
            v-if="!localConfig.clientSessionId"
            type="warning"
            show-icon
            title="缺少客户端会话ID，无法绑定用户级本地工作区"
          />
          <el-form label-width="120px" label-position="left" class="delivery-form">
            <el-form-item label="工作区目录">
              <div class="inline-control">
                <el-input v-model="deliveryWorkspacePath" placeholder="选择本机用于保存AI交付产物仓的目录" clearable />
                <el-button :icon="FolderOpened" @click="selectDeliveryWorkspace">选择目录</el-button>
                <el-button type="primary" :loading="savingDeliveryWorkspace" @click="saveDeliveryWorkspace">保存</el-button>
              </div>
            </el-form-item>
            <el-form-item label="当前状态">
              <el-tag :type="deliveryWorkspace?.status === 'ACTIVE' ? 'success' : 'warning'">
                {{ deliveryWorkspace?.status || '未配置' }}
              </el-tag>
            </el-form-item>
          </el-form>

          <el-divider />

          <div class="section-heading">
            <div>
              <strong>项目产物仓</strong>
              <p class="muted">{{ project.current?.repository?.repoUrl || '当前项目未配置产物仓' }}</p>
            </div>
            <div class="toolbar-actions">
              <el-button :icon="Refresh" :disabled="!project.current" @click="checkProjectRepoStatus">检查状态</el-button>
              <el-button type="success" :icon="Upload" :disabled="!project.current || !canPushRepo" :loading="pushingRepo" @click="pushProjectRepo">提交</el-button>
              <el-button type="primary" :disabled="!project.current" :loading="cloningRepo" @click="cloneProjectRepo">Clone</el-button>
            </div>
          </div>
          <el-descriptions v-if="projectRepoState" :column="1" border class="repo-state">
            <el-descriptions-item label="状态">
              <el-tag :type="repoStatusTagType(projectRepoState.syncStatus)">{{ repoStatusText(projectRepoState.syncStatus) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="本地路径">{{ projectRepoState.localRepoPath }}</el-descriptions-item>
            <el-descriptions-item label="本地提交">{{ projectRepoState.headCommit || '-' }}</el-descriptions-item>
            <el-descriptions-item label="远端提交">{{ projectRepoState.remoteCommit || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="尚未检查项目产物仓状态" />

          <el-divider />

          <div class="section-heading">
            <div>
              <strong>Git SSH 凭证</strong>
              <p class="muted">私钥只保存在本机，中心仅记录公钥和 fingerprint。</p>
            </div>
            <el-button type="primary" :icon="Key" :loading="generatingCredential" @click="generateCredential">生成凭证</el-button>
          </div>
          <el-table :data="gitCredentials" class="credential-table">
            <el-table-column prop="platform" label="平台" width="130" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="fingerprint" label="Fingerprint" min-width="220" />
            <el-table-column label="公钥" min-width="260">
              <template #default="{ row }">
                <el-input :model-value="row.publicKey" readonly />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" :icon="CopyDocument" @click="copyPublicKey(row.publicKey)">复制</el-button>
                <el-button link type="warning" @click="regenerateCredential(row.id)">重新生成</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="工程目录" name="workspace">
        <el-card>
          <template #header>
            <span>{{ project.current?.name || '当前项目' }} · 私有工程父目录</span>
          </template>
          <div v-if="project.workspaceMappings.length" class="path-list">
            <el-tag
              v-for="mapping in project.workspaceMappings"
              :key="mapping.id"
              closable
              size="large"
              @close="removePath(mapping.id)"
            >
              {{ mapping.localPath }}
            </el-tag>
          </div>
          <el-empty v-else description="暂无配置" />

          <div class="path-input-section">
            <el-input v-model="newPath" placeholder="输入本机工程父目录绝对路径" clearable>
              <template #append>
                <el-button @click="addPath">添加</el-button>
              </template>
            </el-input>
            <el-button @click="openDirectoryPicker">选择目录</el-button>
          </div>

          <div v-if="newPath.trim() && subdirectories.length" class="subdir-section">
            <div class="subdir-header">
              <el-icon><FolderOpened /></el-icon>
              <span>子目录 ({{ subdirectories.length }})</span>
            </div>
            <div class="subdir-list">
              <el-tag
                v-for="dir in subdirectories"
                :key="dir.path"
                type="info"
                effect="plain"
                class="subdir-tag"
              >
                <el-icon class="subdir-icon"><Folder /></el-icon>
                {{ dir.name }}
              </el-tag>
            </div>
          </div>
          <div v-else-if="loadingDirs" class="subdir-section">
            <el-skeleton :rows="2" animated />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="本机环境" name="environment">
        <el-card>
          <el-form label-width="110px" label-position="left">
            <el-form-item label="中心服务">
              <el-input v-model="localConfig.centerBaseUrl" placeholder="http://127.0.0.1:8728" />
            </el-form-item>
            <el-form-item label="本机 Runner">
              <el-input v-model="localConfig.runnerBaseUrl" placeholder="http://127.0.0.1:8718" />
            </el-form-item>
            <el-form-item label="终端">
              <el-select v-model="localConfig.terminalPreference">
                <el-option label="macOS Terminal" value="MACOS_TERMINAL" />
                <el-option label="Windows Terminal" value="WINDOWS_TERMINAL" />
                <el-option label="PowerShell" value="POWERSHELL" />
                <el-option label="System Shell" value="SYSTEM_SHELL" />
              </el-select>
            </el-form-item>
          </el-form>

          <el-table :data="localConfig.agentProviders" class="agent-table">
            <el-table-column prop="id" label="Provider" min-width="120" />
            <el-table-column label="命令" min-width="220">
              <template #default="{ row }">
                <el-input v-model="row.command" />
              </template>
            </el-table-column>
            <el-table-column label="启用" width="90">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
          </el-table>

          <el-table :data="settings.diagnostics" class="diagnostic-table">
            <el-table-column prop="label" label="检查项" min-width="140" />
            <el-table-column prop="detail" label="结果" min-width="180" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'OK' ? 'success' : row.status === 'WARN' ? 'warning' : 'danger'">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="table-actions">
            <el-button type="primary" :loading="saving" @click="saveDesktopConfig">保存本机环境</el-button>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Back, CopyDocument, Folder, FolderOpened, Key, Refresh, Upload } from '@element-plus/icons-vue';
import { apiClient, type DeliveryWorkspaceVO, type GitCredentialVO, type ProjectRepoStateVO, type ProjectRepoSyncStatus } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useSettingsStore } from '@/stores/settings';
import { defaultDesktopLocalConfig, type DesktopLocalConfig, type Subdirectory } from '@/services/desktop-local-config';

const router = useRouter();
const auth = useAuthStore();
const project = useProjectStore();
const settings = useSettingsStore();
const activeTab = ref('profile');
const profileName = ref('');
const newPath = ref('');
const saving = ref(false);
const savingDeliveryWorkspace = ref(false);
const generatingCredential = ref(false);
const cloningRepo = ref(false);
const pushingRepo = ref(false);
const subdirectories = ref<Subdirectory[]>([]);
const loadingDirs = ref(false);
const localConfig = reactive<DesktopLocalConfig>(defaultDesktopLocalConfig());
const deliveryWorkspace = ref<DeliveryWorkspaceVO | undefined>();
const deliveryWorkspacePath = ref('');
const gitCredentials = ref<GitCredentialVO[]>([]);
const projectRepoState = ref<ProjectRepoStateVO | undefined>();

function syncLocalConfig(config: DesktopLocalConfig) {
  Object.assign(localConfig, JSON.parse(JSON.stringify(config)));
}

function goBack() {
  router.push(project.current ? { name: 'requirements' } : { name: 'projects' });
}

async function saveProfile() {
  const name = profileName.value.trim();
  if (!name) {
    ElMessage.warning('请填写展示名称');
    return;
  }
  saving.value = true;
  try {
    await auth.updateProfile(name);
    ElMessage.success('保存成功');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function addPath() {
  const trimmed = newPath.value.trim();
  if (!trimmed) {
    return;
  }
  try {
    await project.addWorkspaceMapping(trimmed);
    newPath.value = '';
    ElMessage.success('目录已保存');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  }
}

async function removePath(mappingId: number) {
  await project.disableWorkspaceMapping(mappingId);
}

async function openDirectoryPicker() {
  const selected = await window.aiDeliveryDesktop?.selectDirectory?.();
  if (selected) {
    newPath.value = selected;
  }
}

async function selectDeliveryWorkspace() {
  const selected = await window.aiDeliveryDesktop?.selectDirectory?.();
  if (selected) {
    deliveryWorkspacePath.value = selected;
  }
}

async function loadDeliveryWorkspace() {
  if (!localConfig.clientSessionId) {
    await settings.ensureClientSessionId();
    syncLocalConfig(settings.desktopConfig);
  }
  if (!localConfig.clientSessionId) {
    deliveryWorkspace.value = undefined;
    deliveryWorkspacePath.value = '';
    return;
  }
  try {
    deliveryWorkspace.value = await apiClient.getDeliveryWorkspace(localConfig.clientSessionId);
    deliveryWorkspacePath.value = deliveryWorkspace.value?.localPath || '';
  } catch (error: any) {
    deliveryWorkspace.value = undefined;
    if (error.message) {
      ElMessage.warning(error.message);
    }
  }
}

async function saveDeliveryWorkspace() {
  const localPath = deliveryWorkspacePath.value.trim();
  if (!localPath) {
    ElMessage.warning('请选择交付工作区目录');
    return;
  }
  // 若 clientSessionId 缺失，先尝试向中心服务注册
  if (!localConfig.clientSessionId) {
    await settings.ensureClientSessionId();
    syncLocalConfig(settings.desktopConfig);
  }
  if (!localConfig.clientSessionId) {
    ElMessage.error('无法注册客户端会话，请检查中心服务是否可用');
    return;
  }
  savingDeliveryWorkspace.value = true;
  try {
    deliveryWorkspace.value = await apiClient.saveDeliveryWorkspace(localPath, localConfig.clientSessionId);
    deliveryWorkspacePath.value = deliveryWorkspace.value.localPath;
    ElMessage.success('交付工作区已保存');
  } catch (error: any) {
    ElMessage.error(error.message || '保存交付工作区失败');
  } finally {
    savingDeliveryWorkspace.value = false;
  }
}

async function loadGitCredentials() {
  try {
    gitCredentials.value = await apiClient.listGitCredentials();
  } catch (error: any) {
    gitCredentials.value = [];
    if (error.message) {
      ElMessage.warning(error.message);
    }
  }
}

async function generateCredential() {
  generatingCredential.value = true;
  try {
    const credential = await apiClient.generateLocalGitCredential({ platform: 'PROJECT_GIT' });
    await loadGitCredentials();
    ElMessage.success(`Git凭证已生成: ${credential.fingerprint}`);
  } catch (error: any) {
    ElMessage.error(error.message || '生成Git凭证失败');
  } finally {
    generatingCredential.value = false;
  }
}

async function regenerateCredential(credentialId: string | number) {
  generatingCredential.value = true;
  try {
    const credential = await apiClient.regenerateLocalGitCredential(credentialId, { platform: 'PROJECT_GIT' });
    await loadGitCredentials();
    ElMessage.success(`Git凭证已重新生成: ${credential.fingerprint}`);
  } catch (error: any) {
    ElMessage.error(error.message || '重新生成Git凭证失败');
  } finally {
    generatingCredential.value = false;
  }
}

async function copyPublicKey(publicKey: string) {
  try {
    await navigator.clipboard.writeText(publicKey);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = publicKey;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  ElMessage.success('公钥已复制');
}

function repoStatusText(status?: ProjectRepoSyncStatus): string {
  const labels: Record<ProjectRepoSyncStatus, string> = {
    NOT_CLONED: '未 clone',
    READY: '可操作',
    BEHIND_REMOTE: '落后远端',
    DIRTY: '存在本地变更',
    CONFLICTING: '存在冲突',
    PUSHING: '推送中',
    PUSHED: '已推送',
    FAILED: '检查失败'
  };
  return status ? labels[status] || status : '未知';
}

function repoStatusTagType(status?: ProjectRepoSyncStatus) {
  if (status === 'READY' || status === 'PUSHED') {
    return 'success';
  }
  if (status === 'BEHIND_REMOTE' || status === 'DIRTY' || status === 'NOT_CLONED') {
    return 'warning';
  }
  if (status === 'CONFLICTING' || status === 'FAILED') {
    return 'danger';
  }
  return 'info';
}

async function checkProjectRepoStatus() {
  if (!project.current) {
    return;
  }
  try {
    projectRepoState.value = await apiClient.getProjectRepositoryStatus(project.current.id);
  } catch (error: any) {
    projectRepoState.value = undefined;
    ElMessage.error(error.message || '检查项目产物仓失败');
  }
}

async function cloneProjectRepo() {
  if (!project.current) {
    return;
  }
  cloningRepo.value = true;
  try {
    projectRepoState.value = await apiClient.cloneProjectRepository(project.current.id);
    ElMessage.success('项目产物仓已初始化');
  } catch (error: any) {
    ElMessage.error(error.message || 'Clone项目产物仓失败');
  } finally {
    cloningRepo.value = false;
  }
}

const canPushRepo = computed(() => {
  const status = projectRepoState.value?.syncStatus;
  return status && status !== 'NOT_CLONED' && status !== 'PUSHING';
});

async function pushProjectRepo() {
  if (!project.current) {
    return;
  }
  const status = projectRepoState.value?.syncStatus;
  if (status === 'NOT_CLONED') {
    ElMessage.warning('请先 Clone 项目产物仓');
    return;
  }
  if (status === 'PUSHING') {
    return;
  }

  let message = '';
  try {
    const result = await ElMessageBox.prompt('请输入提交信息（可选，留空将使用默认信息）', '提交到 Git', {
      confirmButtonText: '提交',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：同步需求文档与代码评审结果',
      inputPattern: /^.{0,200}$/,
      inputErrorMessage: '提交信息不能超过200字符'
    });
    message = String(result.value || '').trim();
  } catch {
    // 用户取消
    return;
  }

  pushingRepo.value = true;
  try {
    projectRepoState.value = await apiClient.pushProjectRepository(project.current.id, message ? { message } : {});
    ElMessage.success('提交并推送成功');
  } catch (error: any) {
    ElMessage.error(error.message || '提交失败');
  } finally {
    pushingRepo.value = false;
  }
}

async function loadSubdirectories() {
  const dirPath = newPath.value.trim();
  if (!dirPath) {
    subdirectories.value = [];
    return;
  }
  loadingDirs.value = true;
  try {
    subdirectories.value = await window.aiDeliveryDesktop?.listSubdirectories?.(dirPath) ?? [];
  } finally {
    loadingDirs.value = false;
  }
}

watch(newPath, () => {
  loadSubdirectories();
});

async function saveDesktopConfig() {
  saving.value = true;
  try {
    await settings.saveDesktop(JSON.parse(JSON.stringify(localConfig)));
    syncLocalConfig(settings.desktopConfig);
    ElMessage.success('保存成功');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function logout() {
  project.clearSelection();
  await auth.logout();
  router.push({ name: 'login' });
}

onMounted(async () => {
  await settings.load();
  await settings.ensureClientSessionId();
  syncLocalConfig(settings.desktopConfig);
  profileName.value = auth.user?.displayName || '';
  await loadDeliveryWorkspace();
  await loadGitCredentials();
  if (project.current) {
    await project.loadWorkspaceMappings();
    await checkProjectRepoStatus();
  }
});
</script>

<style scoped>
.settings-page {
  max-width: 980px;
  margin: 0 auto;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.muted {
  color: #6b7280;
  margin: 0.25rem 0 0;
}

.settings-tabs {
  width: 100%;
}

.agent-table,
.diagnostic-table {
  margin-top: 1rem;
}

.table-actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 1rem;
}

.path-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.path-input-section {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.delivery-form {
  margin-top: 0.25rem;
}

.inline-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.repo-state,
.credential-table {
  margin-top: 0.75rem;
}

.subdir-section {
  margin-top: 0.75rem;
}

.subdir-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.subdir-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.subdir-tag {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subdir-icon {
  margin-right: 2px;
}


</style>
