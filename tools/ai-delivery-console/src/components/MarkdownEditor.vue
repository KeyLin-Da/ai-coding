<template>
  <section class="workspace-band">
    <div class="toolbar">
      <div>
        <strong>{{ title }}</strong>
        <p class="muted">{{ artifactPath || '尚未关联产物' }}</p>
      </div>
      <div>
        <el-button :disabled="!artifactPath" :icon="View" @click="load">读取</el-button>
        <el-button type="primary" :disabled="!artifactPath" :icon="DocumentChecked" @click="save">保存</el-button>
      </div>
    </div>
    <div class="editor-layout" style="padding: 12px">
      <el-input v-model="content" type="textarea" :rows="18" resize="vertical" />
      <div class="preview-container">
        <div class="preview-header" :class="{ 'fullscreen-header': isFullscreen }">
          <span class="preview-title">{{ isFullscreen ? '全屏预览（按 ESC 或点击按钮退出）' : '预览' }}</span>
          <el-button 
            :icon="isFullscreen ? Minus : FullScreen" 
            size="small" 
            circle
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全屏' : '全屏预览'"
          />
        </div>
        <article class="markdown-preview" :class="{ fullscreen: isFullscreen }" v-html="previewHtml"></article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { DocumentChecked, FullScreen, Minus, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { apiClient } from '@/api/client';

const props = defineProps<{
  title: string;
  artifactPath?: string;
}>();

const emit = defineEmits<{
  (event: 'saved'): void;
}>();

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const content = ref('');
const expectedHash = ref<string | undefined>();
const isFullscreen = ref(false);

const previewHtml = computed(() => md.render(content.value || ''));

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
}

function handleEscapeKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEscapeKey);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscapeKey);
});

async function load() {
  if (!props.artifactPath) {
    return;
  }
  const result = await apiClient.readArtifact(props.artifactPath);
  content.value = result.content;
  expectedHash.value = result.artifact.hash;
}

async function save() {
  if (!props.artifactPath) {
    return;
  }
  try {
    const result = await apiClient.saveArtifact(props.artifactPath, content.value, expectedHash.value);
    expectedHash.value = result.artifact.hash;
    emit('saved');
    ElMessage.success('已保存');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  }
}

watch(
  () => props.artifactPath,
  () => {
    content.value = '';
    expectedHash.value = undefined;
    if (props.artifactPath) {
      load();
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.preview-container {
  position: relative;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fb;
  border: 1px solid #dfe6f1;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
}

.preview-header.fullscreen-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 12px 24px;
  border-radius: 0;
  border: none;
  border-bottom: 1px solid #e3e8f2;
}

.preview-title {
  font-size: 14px;
  font-weight: 500;
  color: #172033;
}

.markdown-preview {
  min-height: 360px;
  padding: 14px;
  border: 1px solid #dfe6f1;
  border-radius: 0 0 6px 6px;
  background: #fbfcff;
  overflow: auto;
}

.markdown-preview.fullscreen {
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  margin: 0;
  border-radius: 0;
  padding: 40px;
  background: #ffffff;
}
</style>
