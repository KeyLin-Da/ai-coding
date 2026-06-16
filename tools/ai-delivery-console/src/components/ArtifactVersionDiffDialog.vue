<template>
  <el-dialog v-model="visible" title="版本差异对比" width="86%" destroy-on-close class="artifact-version-diff-dialog">
    <div class="version-diff-toolbar">
      <el-select v-model="leftVersionId" size="small" placeholder="旧版本">
        <el-option v-for="version in readableVersions" :key="version.id" :label="versionLabel(version)" :value="version.id" />
      </el-select>
      <span class="diff-arrow">→</span>
      <el-select v-model="rightVersionId" size="small" placeholder="新版本">
        <el-option v-for="version in readableVersions" :key="version.id" :label="versionLabel(version)" :value="version.id" />
      </el-select>
      <el-radio-group v-model="diffViewMode" size="small">
        <el-radio-button value="line-by-line">统一视图</el-radio-button>
        <el-radio-button value="side-by-side">左右对比</el-radio-button>
      </el-radio-group>
      <el-button type="primary" size="small" :loading="loading" :disabled="!canCompare" @click="loadDiff">对比</el-button>
    </div>

    <el-alert v-if="diffResult?.truncated" class="diff-alert" type="warning" show-icon title="diff 内容过长，已截断展示" />
    <div v-loading="loading" class="version-diff-body">
      <div v-if="currentDiffHtml" class="version-diff-html" v-html="currentDiffHtml"></div>
      <el-empty v-else :description="emptyText" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { html as diffToHtml } from 'diff2html/bundles/js/diff2html.min.js';
import 'diff2html/bundles/css/diff2html.min.css';
import type { TechDesignVersion, TechDesignVersionDiff } from '@shared/workflow';
import { apiClient } from '@/api/client';

const visible = ref(false);
const loading = ref(false);
const requirementId = ref('');
const versions = ref<TechDesignVersion[]>([]);
const leftVersionId = ref('');
const rightVersionId = ref('');
const diffViewMode = ref<'line-by-line' | 'side-by-side'>('side-by-side');
const diffResult = ref<TechDesignVersionDiff>();

const readableVersions = computed(() => versions.value.filter((version) => version.readable));
const canCompare = computed(() => Boolean(requirementId.value && leftVersionId.value && rightVersionId.value && leftVersionId.value !== rightVersionId.value));
const currentDiffHtml = computed(() => {
  const diff = diffResult.value?.diff || '';
  if (!diff.trim()) {
    return '';
  }
  return diffToHtml(diff, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: diffViewMode.value
  });
});
const emptyText = computed(() => (diffResult.value ? '当前选择暂无差异' : '请选择两个版本进行对比'));

function versionLabel(version: TechDesignVersion): string {
  return [version.label, version.commitSha?.slice(0, 8)].filter(Boolean).join(' · ');
}

async function loadDiff() {
  if (!canCompare.value) {
    return;
  }
  loading.value = true;
  try {
    diffResult.value = await apiClient.diffTechDesignVersions(requirementId.value, {
      leftVersionId: leftVersionId.value,
      rightVersionId: rightVersionId.value
    });
  } catch (error: any) {
    diffResult.value = undefined;
    ElMessage.error(error.message || '版本对比失败');
  } finally {
    loading.value = false;
  }
}

function open(nextRequirementId: string, nextVersions: TechDesignVersion[], currentVersionId = 'current') {
  requirementId.value = nextRequirementId;
  versions.value = nextVersions;
  const readable = readableVersions.value;
  rightVersionId.value = readable.some((version) => version.id === currentVersionId) ? currentVersionId : readable[0]?.id || '';
  leftVersionId.value = readable.find((version) => version.id !== rightVersionId.value)?.id || '';
  diffResult.value = undefined;
  visible.value = true;
  if (canCompare.value) {
    loadDiff();
  }
}

defineExpose({ open });
</script>

<style scoped>
.version-diff-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.version-diff-toolbar .el-select {
  width: 220px;
}

.diff-arrow {
  color: #6b7280;
}

.diff-alert {
  margin-bottom: 12px;
}

.version-diff-body {
  min-height: 520px;
  max-height: 68vh;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
}

.version-diff-html {
  padding: 12px;
}
</style>
