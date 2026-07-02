<template>
  <el-dialog v-model="visible" fullscreen destroy-on-close class="artifact-preview-dialog">
    <ArtifactPreviewShell
      ref="previewShell"
      :artifact="artifact"
      :content="content"
      :loading="loading"
      :project-id="projectId"
      :requirement-pk="requirementPk"
      can-create-annotation
      can-share
      @share="openShareDialog"
    />
    <ArtifactShareDialog ref="shareDialog" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { apiClient } from '@/api/client';
import ArtifactPreviewShell from '@/components/ArtifactPreviewShell.vue';
import ArtifactShareDialog from '@/components/ArtifactShareDialog.vue';

const visible = ref(false);
const loading = ref(false);
const artifact = ref<ArtifactRef>();
const projectId = ref<string | number>('');
const requirementPk = ref<string | number>('');
const content = ref('');
const previewShell = ref<InstanceType<typeof ArtifactPreviewShell>>();
const shareDialog = ref<InstanceType<typeof ArtifactShareDialog>>();

const extension = computed(() => {
  const filePath = artifact.value?.path || '';
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : '';
});
const isPdf = computed(() => extension.value === '.pdf');
const isImage = computed(() => artifact.value?.kind === 'image' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension.value));
const requirementId = computed(() => artifact.value?.path.match(/^docs\/([^/]+)\//)?.[1] || '');

async function open(nextArtifact: ArtifactRef, nextProjectId: string | number, nextRequirementPk: string | number = '') {
  artifact.value = nextArtifact;
  projectId.value = nextProjectId;
  requirementPk.value = nextRequirementPk;
  content.value = '';
  if (!nextArtifact.exists) {
    ElMessage.warning('文件尚未生成');
    return;
  }
  visible.value = true;
  if (isImage.value || isPdf.value) {
    return;
  }
  loading.value = true;
  try {
    const result = await apiClient.readArtifact(nextArtifact.path, projectId.value);
    content.value = result.content;
  } catch (error: any) {
    ElMessage.error(error.message || '读取产物失败');
  } finally {
    loading.value = false;
  }
}

function openShareDialog() {
  if (!artifact.value) {
    return;
  }
  if (!projectId.value) {
    ElMessage.warning('请先选择项目后再分享');
    return;
  }
  shareDialog.value?.open({
    artifact: artifact.value,
    projectId: projectId.value,
    requirementId: requirementId.value
  });
}

async function downloadMarkdownArtifact(command: string | number | object) {
  await previewShell.value?.downloadMarkdownArtifact(command);
}

function downloadOriginalArtifact() {
  previewShell.value?.downloadOriginalArtifact();
}

defineExpose({ open, downloadMarkdownArtifact, downloadOriginalArtifact });
</script>

<style scoped>
:global(.artifact-preview-dialog.el-dialog.is-fullscreen) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

:global(.artifact-preview-dialog.el-dialog.is-fullscreen > .el-dialog__body) {
  min-height: 0;
  overflow: hidden;
  padding: 0;
}
</style>
