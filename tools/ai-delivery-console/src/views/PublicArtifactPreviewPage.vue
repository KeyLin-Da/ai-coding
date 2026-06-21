<template>
  <main class="artifact-preview-page">
    <ArtifactPreviewShell
      :artifact="artifact"
      :content="content"
      :loading="loading"
      :allow-download="allowDownload"
      :public-token="token"
      :show-annotations="showAnnotations"
      :can-create-annotation="auth.isAuthenticated"
      :current-user-id="auth.user?.id"
      :public-share-id="share?.id"
      @login-required="redirectToLogin"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { apiClient, type ArtifactShareVO } from '@/api/client';
import ArtifactPreviewShell from '@/components/ArtifactPreviewShell.vue';
import { dispatchTechDesignAnnotationChanged } from '@/services/annotation-realtime';
import { RealtimeClient } from '@/services/realtime-client';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const token = computed(() => String(route.params.token || ''));
const loading = ref(false);
const artifact = ref<ArtifactRef>();
const share = ref<ArtifactShareVO>();
const content = ref('');
const allowDownload = ref(false);
const showAnnotations = ref(true);
let realtimeClient: RealtimeClient | undefined;
let realtimeSubscriptionKey = '';

watch(
  token,
  () => {
    void loadPreview();
  },
  { immediate: true }
);

watch(
  () => [auth.isAuthenticated, share.value?.id, share.value?.realtimeChannel, showAnnotations.value, token.value],
  () => {
    void syncRealtimeSubscription();
  }
);

async function loadPreview() {
  if (!token.value) {
    ElMessage.warning('缺少分享 token');
    return;
  }
  stopRealtimeSubscription();
  share.value = undefined;
  loading.value = true;
  try {
    const result = await apiClient.readPublicArtifactSharePreview(token.value);
    share.value = result.share;
    artifact.value = result.artifact;
    content.value = result.content;
    allowDownload.value = result.allowDownload !== false;
    showAnnotations.value = result.showAnnotations !== false;
  } catch (error: any) {
    ElMessage.error(error.message || '公开分享不可访问');
  } finally {
    loading.value = false;
  }
}

async function syncRealtimeSubscription() {
  const nextKey = [auth.isAuthenticated, share.value?.id, share.value?.realtimeChannel, showAnnotations.value, token.value].join(':');
  if (nextKey === realtimeSubscriptionKey) {
    return;
  }
  stopRealtimeSubscription();
  if (!auth.isAuthenticated || !share.value?.id || !share.value.realtimeChannel || !showAnnotations.value || !token.value) {
    return;
  }
  realtimeSubscriptionKey = nextKey;
  const client = new RealtimeClient({
    onStatus: (status) => {
      if (status === 'CONNECTED' && share.value?.id) {
        dispatchTechDesignAnnotationChanged({ shareId: share.value.id, eventType: 'tech-design.annotation.changed' });
      }
    },
    onShareAnnotationEvent: (event) => {
      dispatchTechDesignAnnotationChanged({
        shareId: event.shareId,
        eventId: event.eventId,
        eventType: event.eventType,
        operation: event.operation
      });
    }
  });
  realtimeClient = client;
  try {
    await client.subscribeArtifactShare(share.value.id, token.value, share.value.realtimeChannel);
  } catch (error) {
    if (realtimeClient === client) {
      console.warn('[PublicArtifactPreview] 批注实时订阅失败:', error);
    }
  }
}

function stopRealtimeSubscription() {
  realtimeClient?.disconnect();
  realtimeClient = undefined;
  realtimeSubscriptionKey = '';
}

function redirectToLogin() {
  router.push({ name: 'login', query: { redirect: route.fullPath } });
}

onUnmounted(stopRealtimeSubscription);
</script>

<style scoped>
.artifact-preview-page {
  height: 100vh;
  min-height: 0;
}
</style>
