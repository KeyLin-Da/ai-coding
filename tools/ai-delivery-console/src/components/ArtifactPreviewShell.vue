<template>
  <section class="artifact-preview-shell" :class="{ 'eye-care': eyeCareMode }">
    <header class="preview-toolbar">
      <div class="preview-title">
        <strong>{{ artifact?.label || '产物预览' }}</strong>
        <p>{{ artifact?.path || '未选择文件' }}</p>
        <p v-if="versionText" class="version-text">{{ versionText }}</p>
      </div>
      <div class="preview-actions">
        <el-button v-if="canShare" :icon="Share" @click="$emit('share')">分享</el-button>
        <div class="preview-zoom-controls" aria-label="预览缩放">
          <el-button :disabled="zoomPercent <= minZoomPercent" :icon="Minus" size="small" circle title="缩小预览" @click="zoomOut" />
          <span class="zoom-percent">{{ zoomPercent }}%</span>
          <el-button :disabled="zoomPercent >= maxZoomPercent" :icon="Plus" size="small" circle title="放大预览" @click="zoomIn" />
          <el-button :disabled="zoomPercent === defaultZoomPercent" :icon="Refresh" size="small" title="恢复 100%" @click="resetZoom" />
        </div>
        <label class="eye-care-toggle" :class="{ active: eyeCareMode }">
          <input v-model="eyeCareMode" type="checkbox" />
          <span>护眼模式</span>
        </label>
        <el-button :disabled="!artifact" :icon="CopyDocument" @click="copyPath">复制路径</el-button>
        <el-dropdown v-if="isMarkdown && allowDownload" trigger="click" :disabled="!artifact?.exists" @command="downloadMarkdownArtifact">
          <el-button :disabled="!artifact?.exists" :icon="Download">下载</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
              <el-dropdown-item command="html">HTML</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-else-if="allowDownload" :disabled="!artifact?.exists" :icon="Download" @click="downloadOriginalArtifact">下载</el-button>
      </div>
    </header>

    <div v-loading="loading" class="preview-body">
      <div class="preview-zoom-stage" :style="zoomStageStyle">
        <article v-if="isMarkdown" ref="markdownPreviewRef" class="markdown-preview artifact-markdown" v-html="previewHtml"></article>
        <iframe v-else-if="isHtml" class="artifact-frame" :srcdoc="content" title="产物预览"></iframe>
        <iframe v-else-if="isPdf" class="artifact-frame" :src="assetUrl" title="产物预览"></iframe>
        <div v-else-if="isImage" class="artifact-image-wrap">
          <img :src="assetUrl" :alt="artifact?.label || '产物图片'" />
        </div>
        <pre v-else class="artifact-code"><code>{{ formattedContent }}</code></pre>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import { CopyDocument, Download, Minus, Plus, Refresh, Share } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { ArtifactRef } from '@shared/workflow';
import { artifactReadUrl, publicArtifactAssetUrl, rewriteMarkdownImageSources } from '@/utils/markdown-assets';

type DownloadFormat = 'markdown' | 'html';

const props = withDefaults(
  defineProps<{
    artifact?: ArtifactRef;
    content?: string;
    loading?: boolean;
    allowDownload?: boolean;
    canShare?: boolean;
    publicToken?: string;
    projectId?: string | number;
  }>(),
  {
    artifact: undefined,
    content: '',
    loading: false,
    allowDownload: true,
    canShare: false,
    publicToken: '',
    projectId: ''
  }
);

defineEmits<{ (event: 'share'): void }>();

const markdownPreviewRef = ref<HTMLElement>();
const eyeCareStorageKey = 'ai-delivery-preview-eye-care';
const minZoomPercent = 60;
const maxZoomPercent = 400;
const defaultZoomPercent = 100;
const zoomStepPercent = 10;
const zoomPercent = ref(defaultZoomPercent);

function readEyeCareMode() {
  try {
    return globalThis.localStorage?.getItem(eyeCareStorageKey) === '1';
  } catch {
    return false;
  }
}

const eyeCareMode = ref(readEyeCareMode());

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
      return `<div class="mermaid mermaid-diagram">${md.utils.escapeHtml(token.content.trim())}</div>`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
};

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.use(mermaidPlugin);

const extension = computed(() => {
  const filePath = props.artifact?.path || '';
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : '';
});
const isMarkdown = computed(() => props.artifact?.kind === 'markdown' || ['.md', '.markdown'].includes(extension.value));
const isHtml = computed(() => props.artifact?.kind === 'html' || ['.html', '.htm'].includes(extension.value));
const isPdf = computed(() => extension.value === '.pdf');
const isImage = computed(() => props.artifact?.kind === 'image' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension.value));
const zoomScale = computed(() => zoomPercent.value / 100);
const zoomStageStyle = computed<Record<string, string>>(() => ({
  '--preview-zoom-scale': String(zoomScale.value),
  zoom: String(zoomScale.value)
}));
const assetUrl = computed(() => {
  if (!props.artifact?.path) {
    return '';
  }
  return props.publicToken ? publicArtifactAssetUrl(props.publicToken, props.artifact.path) : artifactReadUrl(props.artifact.path, props.projectId);
});
const previewHtml = computed(() => {
  const rendered = md.render(props.content || '');
  return rewriteMarkdownImageSources(
    rendered,
    props.artifact?.path,
    props.publicToken
      ? (assetPath) => publicArtifactAssetUrl(props.publicToken, assetPath)
      : (assetPath) => artifactReadUrl(assetPath, props.projectId)
  );
});
const formattedContent = computed(() => {
  if (extension.value === '.json') {
    try {
      return JSON.stringify(JSON.parse(props.content || ''), null, 2);
    } catch {
      return props.content || '';
    }
  }
  return props.content || '';
});
const versionText = computed(() => {
  if (!props.artifact) {
    return '';
  }
  const segments: string[] = [];
  if (props.artifact.currentVersionNo) {
    segments.push(`v${props.artifact.currentVersionNo}`);
  }
  if (props.artifact.versionCount) {
    segments.push(`${props.artifact.versionCount} 个版本`);
  }
  if (props.artifact.sourceRunId) {
    segments.push(`run ${props.artifact.sourceRunId}`);
  }
  return segments.join(' · ');
});

watch(previewHtml, async () => {
  await nextTick();
  await renderMermaidDiagrams().catch((error) => console.error('Mermaid rendering error:', error));
});

watch(eyeCareMode, (value) => {
  try {
    globalThis.localStorage?.setItem(eyeCareStorageKey, value ? '1' : '0');
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
});

function setZoom(value: number) {
  zoomPercent.value = Math.min(maxZoomPercent, Math.max(minZoomPercent, value));
}

function zoomIn() {
  setZoom(zoomPercent.value + zoomStepPercent);
}

function zoomOut() {
  setZoom(zoomPercent.value - zoomStepPercent);
}

function resetZoom() {
  setZoom(defaultZoomPercent);
}

async function renderMermaidDiagrams() {
  const nodes = markdownPreviewRef.value ? Array.from(markdownPreviewRef.value.querySelectorAll<HTMLElement>('.mermaid')) : [];
  await mermaid.run(nodes.length ? { nodes } : undefined);
}

function handleZoomShortcut(event: KeyboardEvent) {
  if (!event.metaKey && !event.ctrlKey) {
    return;
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomIn();
    return;
  }
  if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomOut();
    return;
  }
  if (event.key === '0') {
    event.preventDefault();
    resetZoom();
  }
}

onMounted(() => window.addEventListener('keydown', handleZoomShortcut));
onUnmounted(() => window.removeEventListener('keydown', handleZoomShortcut));

async function copyPath() {
  if (!props.artifact?.path) {
    return;
  }
  await navigator.clipboard.writeText(props.artifact.path).catch(() => undefined);
  ElMessage.success('路径已复制');
}

function fileName(extensionName: string) {
  const base = (props.artifact?.label || props.artifact?.path.split('/').pop() || 'artifact')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[\\/:*?"<>|#%{}$!`&=+@~，。；：、（）【】《》\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'artifact';
  return `${base}.${extensionName.replace(/^\./, '')}`;
}

function downloadBlob(value: string, name: string, type: string) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function downloadMarkdownArtifact(command: string | number | object) {
  const format = String(command) as DownloadFormat;
  if (format === 'markdown') {
    downloadBlob(props.content || '', fileName('md'), 'text/markdown;charset=utf-8');
    return;
  }
  await nextTick();
  downloadBlob(`<!doctype html><meta charset="utf-8"><article>${previewHtml.value}</article>`, fileName('html'), 'text/html;charset=utf-8');
}

function downloadOriginalArtifact() {
  if (!assetUrl.value) {
    return;
  }
  const link = document.createElement('a');
  link.href = assetUrl.value;
  link.download = fileName(extension.value || 'artifact');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<style scoped>
.artifact-preview-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #f6f8fb;
}

.preview-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}

.preview-title {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.preview-title strong,
.preview-title p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-title p {
  color: #64748b;
  font-size: 13px;
}

.version-text {
  color: #2563eb !important;
}

.preview-actions,
.preview-zoom-controls,
.eye-care-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.preview-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.preview-zoom-controls,
.eye-care-toggle {
  height: 32px;
  padding: 0 8px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: #ffffff;
}

.zoom-percent {
  min-width: 44px;
  color: #394b63;
  font-size: 13px;
  text-align: center;
}

.eye-care-toggle {
  color: #50617a;
  font-size: 13px;
  cursor: pointer;
}

.eye-care-toggle.active {
  color: #345044;
  border-color: #a7c4ae;
  background: #edf7ed;
}

.eye-care-toggle input {
  width: 14px;
  height: 14px;
  margin: 0;
}

.preview-body {
  min-height: 0;
  overflow: auto;
  background: #ffffff;
}

.artifact-preview-shell.eye-care .preview-body,
.artifact-preview-shell.eye-care .artifact-markdown {
  color: #26362f;
  background: #f8f1df;
}

.preview-zoom-stage {
  width: 100%;
  min-height: 100%;
  transform-origin: top left;
}

.artifact-markdown {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 28px;
  background: #ffffff;
}

.artifact-markdown :deep(.mermaid-diagram) {
  width: 100%;
  margin: 24px 0 28px;
  padding: 8px 0 14px;
  overflow-x: auto;
  overflow-y: hidden;
}

.artifact-markdown :deep(.mermaid-diagram svg) {
  display: block;
  max-width: 100% !important;
  height: auto;
}

.artifact-frame {
  display: block;
  width: 100%;
  height: calc(100vh - 72px);
  border: 0;
  background: #ffffff;
}

.artifact-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 72px);
  padding: 24px;
  background: #f8fafc;
}

.artifact-image-wrap img {
  max-width: 100%;
  max-height: calc(100vh - 120px);
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
  .preview-toolbar {
    flex-direction: column;
  }

  .preview-actions {
    justify-content: flex-start;
  }
}
</style>
