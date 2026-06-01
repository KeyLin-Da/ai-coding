<template>
  <section class="settings-page">
    <div class="toolbar">
      <div>
        <strong>全局设置</strong>
        <p class="muted">配置工程父目录，Agent 将通过这些路径定位需求关联的工程代码。</p>
      </div>
    </div>

    <el-alert v-if="!settings.projectPaths.length" type="warning" show-icon :closable="false" class="mb-4">
      请配置至少一个工程父目录，Agent 将通过此路径查找需求关联的工程代码。
    </el-alert>

    <el-card>
      <template #header>
        <span>工程父目录列表</span>
      </template>

      <div v-if="settings.projectPaths.length" class="path-list">
        <el-tag v-for="(path, index) in settings.projectPaths" :key="index" closable @close="removePath(index)" size="large">
          {{ path }}
        </el-tag>
      </div>
      <el-empty v-else description="暂无配置" />

      <div class="path-input-section">
        <el-input v-model="newPath" placeholder="输入绝对路径（如 /Users/dev/projects）" clearable>
          <template #append>
            <el-button @click="addPath">添加</el-button>
          </template>
        </el-input>
        <input ref="directoryInput" type="file" webkitdirectory multiple class="hidden-directory-input" @change="onDirectoryPicked" />
        <el-button @click="directoryInput?.click()">选择目录</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
      </div>
    </el-card>

    <el-card class="mt-4">
      <template #header>说明</template>
      <ul class="info-list">
        <li>每个路径必须是绝对路径（以 `/` 开头）</li>
        <li>支持配置多个路径，Agent 会按顺序在这些路径下查找工程代码</li>
        <li>配置保存在本地 `.ai-delivery/settings.json` 文件中</li>
      </ul>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const newPath = ref('');
const saving = ref(false);
const directoryInput = ref<HTMLInputElement>();

async function addPath() {
  const trimmed = newPath.value.trim();
  if (!trimmed) return;
  if (!trimmed.startsWith('/')) {
    ElMessage.warning('路径必须为绝对路径（以 `/` 开头）');
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

async function save() {
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

onMounted(() => {
  void settings.load();
});
</script>

<style scoped>
.settings-page {
  max-width: 800px;
  margin: 0 auto;
}

.mb-4 {
  margin-bottom: 1rem;
}

.mt-4 {
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

.info-list {
  padding-left: 1.2rem;
  line-height: 1.8;
}
</style>
