<template>
  <section class="workspace-band">
    <div class="toolbar">
      <div>
        <strong>{{ title }}</strong>
        <p class="muted">{{ artifactPath || '尚未关联产物' }}</p>
      </div>
      <div>
        <el-button :disabled="!artifactPath" :icon="View" @click="load">读取</el-button>
        <el-button :disabled="!artifactPath || !content" :icon="Download" @click="download">下载</el-button>
        <el-button type="primary" :disabled="!artifactPath" :icon="DocumentChecked" @click="save">保存</el-button>
      </div>
    </div>
    <div class="editor-layout" style="padding: 12px">
      <div class="editor-panel">
        <el-input 
          v-model="content" 
          type="textarea" 
          :rows="18" 
          resize="none"
          class="sync-scroll-editor"
          @scroll="onEditorScroll"
        />
      </div>
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
        <article 
          class="markdown-preview sync-scroll-preview" 
          :class="{ fullscreen: isFullscreen }" 
          v-html="previewHtml"
          @scroll="onPreviewScroll"
        ></article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import { DocumentChecked, Download, FullScreen, Minus, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { apiClient } from '@/api/client';
import mermaid from 'mermaid';

const props = defineProps<{
  title: string;
  artifactPath?: string;
}>();

const emit = defineEmits<{
  (event: 'saved'): void;
}>();

// 初始化 mermaid
mermaid.initialize({ 
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose'
});

// 自定义 markdown-it 插件处理 mermaid 代码块
const mermaidPlugin = (md: MarkdownIt) => {
  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    if (token.info === 'mermaid') {
      const code = token.content.trim();
      return `<div class="mermaid">${md.utils.escapeHtml(code)}</div>`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
};

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.use(mermaidPlugin);
const content = ref('');
const expectedHash = ref<string | undefined>();
const isFullscreen = ref(false);
const isScrolling = ref(false);

const previewHtml = computed(() => {
  const rendered = md.render(content.value || '');
  // 处理图片路径，将相对路径转换为 API 访问路径
  if (props.artifactPath) {
    const basePath = props.artifactPath.substring(0, props.artifactPath.lastIndexOf('/'));
    return rendered.replace(
      /<img([^>]*)src="([^"]+)"([^>]*)>/g,
      (match, before, src, after) => {
        // 如果是相对路径，转换为 API 路径
        if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
          const fullPath = `${basePath}/${src}`;
          return `<img${before}src="/api/artifacts/read?path=${encodeURIComponent(fullPath)}"${after}>`;
        }
        return match;
      }
    );
  }
  return rendered;
});

// 在 DOM 更新后渲染 mermaid 图表
watch(previewHtml, async () => {
  await nextTick();
  try {
    await mermaid.run();
  } catch (error) {
    console.error('Mermaid rendering error:', error);
  }
});

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
}

function handleEscapeKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false;
  }
}

// 同步滚动处理
function onEditorScroll(event: Event) {
  if (isScrolling.value) return;
  isScrolling.value = true;
  
  const editor = event.target as HTMLElement;
  const preview = document.querySelector('.sync-scroll-preview') as HTMLElement;
  
  if (preview && !isFullscreen.value) {
    const scrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
    preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
  }
  
  setTimeout(() => {
    isScrolling.value = false;
  }, 50);
}

function onPreviewScroll(event: Event) {
  if (isScrolling.value) return;
  isScrolling.value = true;
  
  const preview = event.target as HTMLElement;
  const editor = document.querySelector('.sync-scroll-editor textarea') as HTMLElement;
  
  if (editor && !isFullscreen.value) {
    const scrollRatio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
    editor.scrollTop = scrollRatio * (editor.scrollHeight - editor.clientHeight);
  }
  
  setTimeout(() => {
    isScrolling.value = false;
  }, 50);
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

function download() {
  if (!props.artifactPath || !content.value) {
    return;
  }
  // 从路径中提取文件名
  const fileName = props.artifactPath.split('/').pop() || 'document.md';
  const blob = new Blob([content.value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success(`已下载 ${fileName}`);
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
.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  min-height: 450px;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.editor-panel :deep(.el-textarea) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-panel :deep(.el-textarea__inner) {
  flex: 1;
  padding: 14px;
  border: 1px solid #dfe6f1;
  border-radius: 6px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  overflow-y: auto;
}

.preview-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  border: 1px solid #dfe6f1;
  border-radius: 6px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fb;
  border-bottom: 1px solid #dfe6f1;
  flex-shrink: 0;
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
  flex: 1;
  padding: 14px;
  background: #fbfcff;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 16px 0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

.markdown-preview.fullscreen :deep(img) {
  max-width: 90%;
  max-height: calc(100vh - 120px);
  margin: 20px auto;
  object-fit: contain;
}

@media (max-width: 760px) {
  .editor-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .editor-panel :deep(.el-textarea__inner) {
    min-height: 260px;
  }

  .preview-container {
    min-height: 320px;
  }
}
</style>
