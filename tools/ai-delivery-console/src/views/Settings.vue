<template>
  <section class="settings-page">
    <div class="toolbar">
      <div>
        <strong>个人中心</strong>
        <p class="muted">{{ settings.osType }} · {{ localConfig.apiMode === 'remote' ? '中心服务' : '本地单机' }}</p>
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Back" @click="goRequirementList">返回列表</el-button>
        <el-button type="primary" :loading="saving" @click="saveDesktopConfig">保存</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="团队身份" name="identity">
        <el-card>
          <el-form label-width="110px" label-position="left">
            <el-form-item label="连接模式">
              <el-radio-group v-model="localConfig.apiMode">
                <el-radio-button label="local">本地</el-radio-button>
                <el-radio-button label="remote">远程</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="中心服务">
              <el-input v-model="localConfig.centerBaseUrl" placeholder="http://127.0.0.1:8728" />
            </el-form-item>
            <el-form-item label="用户 ID">
              <el-input v-model="localConfig.userId" placeholder="1" />
            </el-form-item>
            <el-form-item label="团队 ID">
              <el-input v-model="localConfig.teamId" placeholder="team id" />
            </el-form-item>
            <el-form-item label="项目 ID">
              <el-input v-model="localConfig.projectId" placeholder="project id" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="本机环境" name="environment">
        <el-card>
          <el-form label-width="110px" label-position="left">
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
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="工程目录" name="workspace">
        <el-card>
          <template #header>
            <span>中心项目映射</span>
          </template>
          <el-table :data="localConfig.workspaceMappings">
            <el-table-column label="项目 ID" min-width="160">
              <template #default="{ row }">
                <el-input v-model="row.projectId" />
              </template>
            </el-table-column>
            <el-table-column label="本机目录" min-width="320">
              <template #default="{ row }">
                <el-input v-model="row.localPath" />
              </template>
            </el-table-column>
            <el-table-column width="90">
              <template #default="{ $index }">
                <el-button text type="danger" @click="removeMapping($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-actions">
            <el-button @click="addMapping">添加映射</el-button>
          </div>
        </el-card>

        <el-card class="mt-4">
          <template #header>
            <span>本地工程父目录</span>
          </template>
          <el-alert v-if="!settings.projectPaths.length && localConfig.apiMode === 'local'" type="warning" show-icon :closable="false" class="mb-4">
            请配置至少一个工程父目录。
          </el-alert>
          <div v-if="settings.projectPaths.length" class="path-list">
            <el-tag v-for="(path, index) in settings.projectPaths" :key="index" closable @close="removePath(index)" size="large">
              {{ path }}
            </el-tag>
          </div>
          <el-empty v-else description="暂无配置" />

          <div class="path-input-section">
            <el-input v-model="newPath" placeholder="输入绝对路径" clearable>
              <template #append>
                <el-button @click="addPath">添加</el-button>
              </template>
            </el-input>
            <input ref="directoryInput" type="file" webkitdirectory multiple class="hidden-directory-input" @change="onDirectoryPicked" />
            <el-button @click="directoryInput?.click()">选择目录</el-button>
            <el-button type="primary" :loading="saving" @click="saveProjectPaths">保存目录</el-button>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Back } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { defaultDesktopLocalConfig, type DesktopLocalConfig } from '@/services/desktop-local-config';

const settings = useSettingsStore();
const router = useRouter();
const activeTab = ref('identity');
const newPath = ref('');
const saving = ref(false);
const directoryInput = ref<HTMLInputElement>();
const localConfig = reactive<DesktopLocalConfig>(defaultDesktopLocalConfig());

function syncLocalConfig(config: DesktopLocalConfig) {
  Object.assign(localConfig, JSON.parse(JSON.stringify(config)));
}

async function addPath() {
  const trimmed = newPath.value.trim();
  if (!trimmed) return;
  if (!trimmed.startsWith('/')) {
    ElMessage.warning('路径必须为绝对路径');
    return;
  }
  if (settings.projectPaths.includes(trimmed)) {
    ElMessage.info('该路径已存在');
    newPath.value = '';
    return;
  }
  settings.projectPaths.push(trimmed);
  newPath.value = '';
}

function removePath(index: number) {
  settings.projectPaths.splice(index, 1);
}

function addMapping() {
  localConfig.workspaceMappings.push({ projectId: '', localPath: '' });
}

function removeMapping(index: number) {
  localConfig.workspaceMappings.splice(index, 1);
}

function goRequirementList() {
  router.push({ name: 'requirements' });
}

function onDirectoryPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] as (File & { path?: string; webkitRelativePath?: string }) | undefined;
  if (!file) {
    return;
  }
  const relativePath = file.webkitRelativePath || '';
  if (file.path && relativePath && file.path.endsWith(relativePath)) {
    newPath.value = file.path.slice(0, -relativePath.length).replace(/\/$/, '');
  } else if (file.path) {
    newPath.value = file.path;
  } else {
    ElMessage.info('浏览器未返回绝对路径，请手动粘贴目录路径');
  }
  input.value = '';
}

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

async function saveProjectPaths() {
  if (localConfig.apiMode === 'remote') {
    await saveDesktopConfig();
    return;
  }
  if (!settings.projectPaths.length) {
    ElMessage.warning('请配置至少一个工程父目录');
    return;
  }
  saving.value = true;
  try {
    await settings.save(settings.projectPaths);
    ElMessage.success('保存成功');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await settings.load();
  syncLocalConfig(settings.desktopConfig);
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

.mb-4 {
  margin-bottom: 1rem;
}

.mt-4 {
  margin-top: 1rem;
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

.hidden-directory-input {
  display: none;
}
</style>
