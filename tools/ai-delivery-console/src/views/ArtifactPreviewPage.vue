<template>
  <main class="artifact-preview-page">
    <ArtifactPreviewShell
      :artifact="artifact"
      :content="content"
      :loading="loading"
      :project-id="projectId"
      :requirement-pk="workflow.current?.id"
      can-create-annotation
      can-share
      @share="openShareDialog"
    />
    <ArtifactShareDialog ref="shareDialog" />
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { apiClient } from '@/api/client';
import { useProjectStore } from '@/stores/project';
import { useWorkflowStore } from '@/stores/workflow';
import ArtifactPreviewShell from '@/components/ArtifactPreviewShell.vue';
import ArtifactShareDialog from '@/components/ArtifactShareDialog.vue';

const route = useRoute();
const project = useProjectStore();
const workflow = useWorkflowStore();
const loading = ref(false);
const artifact = ref<ArtifactRef>();
const content = ref('');
const shareDialog = ref<InstanceType<typeof ArtifactShareDialog>>();

const projectId = computed(() => String(route.query.projectId || ''));
const requirementId = computed(() => String(route.query.requirementId || ''));
const artifactPath = computed(() => String(route.query.path || ''));

watch(
  () => [projectId.value, artifactPath.value],
  () => {
    void loadArtifact();
  },
  { immediate: true }
);

async function loadArtifact() {
  if (!projectId.value || !artifactPath.value) {
    ElMessage.warning('缺少分享参数');
    return;
  }
  loading.value = true;
  try {
    workflow.stopWorkflowStream();
    if (!project.projects.length) {
      await project.loadProjects();
    }
    const targetProject = project.projects.find((item) => String(item.id) === projectId.value);
    if (!targetProject) {
      throw new Error('无权访问分享所属项目');
    }
    if (String(project.current?.id || '') !== projectId.value) {
      await project.selectProject(targetProject);
    }
    const result = await apiClient.readArtifact(artifactPath.value, projectId.value);
    artifact.value = result.artifact;
    content.value = result.content;
    if (requirementId.value) {
      await workflow.loadRequirement(requirementId.value);
      workflow.streamWorkflowEvents();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '读取分享产物失败');
  } finally {
    loading.value = false;
  }
}

onUnmounted(() => workflow.stopWorkflowStream());

function openShareDialog() {
  if (!artifact.value) {
    return;
  }
  shareDialog.value?.open({
    artifact: artifact.value,
    projectId: projectId.value,
    requirementId: requirementId.value
  });
}
</script>

<style scoped>
.artifact-preview-page {
  height: 100vh;
  min-height: 0;
}
</style>
