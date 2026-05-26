<template>
  <el-dialog v-model="visible" fullscreen destroy-on-close class="artifact-preview-dialog">
    <template #header>
      <div class="preview-dialog-header">
        <div class="preview-title-block">
          <strong>{{ artifact?.label || '产物预览' }}</strong>
          <p class="muted">{{ artifact?.path || '未选择文件' }}</p>
        </div>
        <div class="preview-header-actions">
          <el-button :disabled="!artifact" :icon="CopyDocument" @click="copyPath">复制路径</el-button>
          <el-button :disabled="!artifact?.exists" :icon="Download" @click="download">下载</el-button>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="preview-dialog-body">
      <article v-if="isMarkdown" class="markdown-preview artifact-markdown" v-html="previewHtml"></article>
      <iframe v-else-if="isHtml || isPdf" class="artifact-frame" :src="artifactUrl" title="产物预览"></iframe>
      <div v-else-if="isImage" class="artifact-image-wrap">
        <img :src="artifactUrl" :alt="artifact?.label || '产物图片'" />
      </div>
      <pre v-else class="artifact-code"><code>{{ formattedContent }}</code></pre>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import { CopyDocument, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { apiClient } from '@/api/client';

const visible = ref(false);
const loading = ref(false);
const artifact = ref<ArtifactRef>();
const content = ref('');

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose'
});

const mermaidPlugin = (md: MarkdownIt) => {
  const defaultFence = md.renderer.rules.fence || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() === 'mermaid') {
      return `<div class="mermaid">${md.utils.escapeHtml(token.content.trim())}</div>`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
};

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.use(mermaidPlugin);

const extension = computed(() => {
  const path = artifact.value?.path || '';
  const dotIndex = path.lastIndexOf('.');
  return dotIndex >= 0 ? path.slice(dotIndex).toLowerCase() : '';
});

const artifactUrl = computed(() => (artifact.value ? `/api/artifacts/read?path=${encodeURIComponent(artifact.value.path)}` : ''));
const isMarkdown = computed(() => artifact.value?.kind === 'markdown' || ['.md', '.markdown'].includes(extension.value));
const isHtml = computed(() => artifact.value?.kind === 'html' || extension.value === '.html');
const isPdf = computed(() => extension.value === '.pdf');
const isImage = computed(() => ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension.value));

const previewHtml = computed(() => {
  const rendered = md.render(content.value || '');
  if (!artifact.value?.path) {
    return rendered;
  }
  const basePath = artifact.value.path.substring(0, artifact.value.path.lastIndexOf('/'));
  return rendered.replace(/<img([^>]*)src="([^"]+)"([^>]*)>/g, (match, before, src, after) => {
    if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
      const fullPath = `${basePath}/${src}`;
      return `<img${before}src="/api/artifacts/read?path=${encodeURIComponent(fullPath)}"${after}>`;
    }
    return match;
  });
});

const formattedContent = computed(() => {
  if (extension.value === '.json') {
    try {
      return JSON.stringify(JSON.parse(content.value), null, 2);
    } catch {
      return content.value;
    }
  }
  return content.value;
});

watch(previewHtml, async () => {
  if (!visible.value || !isMarkdown.value) {
    return;
  }
  await nextTick();
  try {
    await mermaid.run();
  } catch (error) {
    console.error('Mermaid rendering error:', error);
  }
});

async function open(nextArtifact: ArtifactRef) {
  artifact.value = nextArtifact;
  content.value = '';
  if (!nextArtifact.exists) {
    ElMessage.warning('文件尚未生成');
    return;
  }
  visible.value = true;
  if (isImage.value || isPdf.value || isHtml.value) {
    return;
  }
  loading.value = true;
  try {
    const result = await apiClient.readArtifact(nextArtifact.path);
    content.value = result.content;
  } catch (error: any) {
    ElMessage.error(error.message || '读取产物失败');
  } finally {
    loading.value = false;
  }
}

async function copyPath() {
  if (!artifact.value?.path) {
    return;
  }
  try {
    await navigator.clipboard.writeText(artifact.value.path);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = artifact.value.path;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  ElMessage.success('路径已复制');
}

function download() {
  if (!artifact.value?.path) {
    return;
  }
  const link = document.createElement('a');
  link.href = artifactUrl.value;
  link.download = artifact.value.path.split('/').pop() || 'artifact';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

defineExpose({ open });
</script>

<style scoped>
.preview-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-right: 48px;
}

.preview-title-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.preview-title-block strong,
.preview-title-block p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-header-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.preview-dialog-body {
  height: calc(100vh - 96px);
  min-height: 0;
  overflow: auto;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #ffffff;
}

.artifact-markdown {
  max-width: 980px;
  min-height: 100%;
  margin: 0 auto;
  padding: 28px;
  background: #ffffff;
}

.artifact-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #ffffff;
}

.artifact-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  background: #f8fafc;
}

.artifact-image-wrap img {
  max-width: 100%;
  max-height: calc(100vh - 160px);
  object-fit: contain;
}

.artifact-code {
  min-height: 100%;
  margin: 0;
  padding: 20px;
  overflow: auto;
  color: #dbeafe;
  background: #0f172a;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .preview-dialog-header {
    flex-direction: column;
    padding-right: 32px;
  }

  .preview-header-actions {
    width: 100%;
  }

  .preview-header-actions .el-button {
    flex: 1;
  }

  .artifact-markdown {
    padding: 18px;
  }
}
</style>
