<template>
  <main class="artifact-preview-page">
    <ArtifactPreviewShell
      :artifact="artifact"
      :content="content"
      :loading="loading"
      :allow-download="allowDownload"
      :public-token="token"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { apiClient } from '@/api/client';
import ArtifactPreviewShell from '@/components/ArtifactPreviewShell.vue';

const route = useRoute();
const token = computed(() => String(route.params.token || ''));
const loading = ref(false);
const artifact = ref<ArtifactRef>();
const content = ref('');
const allowDownload = ref(false);

watch(
  token,
  () => {
    void loadPreview();
  },
  { immediate: true }
);

async function loadPreview() {
  if (!token.value) {
    ElMessage.warning('缺少分享 token');
    return;
  }
  loading.value = true;
  try {
    const result = await apiClient.readPublicArtifactSharePreview(token.value);
    artifact.value = result.artifact;
    content.value = result.content;
    allowDownload.value = result.allowDownload !== false;
  } catch (error: any) {
    ElMessage.error(error.message || '公开分享不可访问');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.artifact-preview-page {
  height: 100vh;
  min-height: 0;
}
</style>
