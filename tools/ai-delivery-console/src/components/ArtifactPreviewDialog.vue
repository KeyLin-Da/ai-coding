<template>
  <el-dialog v-model="visible" fullscreen destroy-on-close class="artifact-preview-dialog">
    <template #header>
      <div class="preview-dialog-header">
        <div class="preview-title-block">
          <strong>{{ artifact?.label || '产物预览' }}</strong>
          <p class="muted">{{ artifact?.path || '未选择文件' }}</p>
          <p v-if="versionText" class="muted version-summary">{{ versionText }}</p>
        </div>
        <div class="preview-header-actions">
          <TechDesignVersionSelector
            v-if="isTechDesignMarkdown"
            v-model="selectedVersionId"
            :versions="techDesignVersions"
            :loading="loadingVersions"
            @compare="openVersionDiff"
          />
          <el-button v-if="isTechDesignMarkdown" :icon="ChatLineSquare" @click="toggleAnnotationPanel">
            批注 {{ selectedVersionAnnotations.length }}
          </el-button>
          <el-button
            v-if="isTechDesignMarkdown"
            :disabled="!selectionDraft"
            :icon="EditPen"
            @click="createAnnotationFromSelection"
          >
            新增批注
          </el-button>
          <div class="preview-zoom-controls" aria-label="预览缩放">
            <el-button
              class="zoom-out-button"
              :disabled="zoomPercent <= minZoomPercent"
              :icon="Minus"
              size="small"
              circle
              title="缩小预览"
              @click="zoomOut"
            />
            <span class="zoom-percent">{{ zoomPercent }}%</span>
            <el-button
              class="zoom-in-button"
              :disabled="zoomPercent >= maxZoomPercent"
              :icon="Plus"
              size="small"
              circle
              title="放大预览"
              @click="zoomIn"
            />
            <el-button
              class="zoom-reset-button"
              :disabled="zoomPercent === defaultZoomPercent"
              :icon="Refresh"
              size="small"
              title="恢复 100%"
              @click="resetZoom"
            />
          </div>
          <label class="eye-care-toggle" :class="{ active: eyeCareMode }">
            <input v-model="eyeCareMode" type="checkbox" />
            <span>护眼模式</span>
          </label>
          <el-button :disabled="!artifact" :icon="CopyDocument" @click="copyPath">复制路径</el-button>
          <el-button :disabled="!artifact?.exists" :icon="Download" @click="download">下载</el-button>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="preview-dialog-body" :class="{ 'eye-care': eyeCareMode }">
      <div v-if="isMarkdown && isTechDesignMarkdown" class="tech-design-preview-layout" :class="{ 'annotation-panel-collapsed': !annotationPanelVisible }">
        <div class="tech-design-preview-scroll">
          <div class="preview-zoom-stage" :style="zoomStageStyle">
            <article
              ref="markdownPreviewRef"
              class="markdown-preview artifact-markdown"
              v-html="previewHtml"
              @mouseup="captureSelection"
              @keyup="captureSelection"
            ></article>
          </div>
        </div>
        <TechDesignAnnotationPanel
          v-if="annotationPanelVisible"
          :annotations="selectedVersionAnnotations"
          @collapse="annotationPanelVisible = false"
          @delete="deleteAnnotation"
          @locate="locateAnnotation"
          @resolve="resolveAnnotation"
          @toggle-include="toggleAnnotationInclude"
        />
      </div>
      <div v-else class="preview-zoom-stage" :style="zoomStageStyle">
        <article v-if="isMarkdown" ref="markdownPreviewRef" class="markdown-preview artifact-markdown" v-html="previewHtml"></article>
        <iframe v-else-if="isHtml || isPdf" class="artifact-frame" :src="artifactUrl" title="产物预览"></iframe>
        <div v-else-if="isImage" class="artifact-image-wrap">
          <img :src="artifactUrl" :alt="artifact?.label || '产物图片'" />
        </div>
        <pre v-else class="artifact-code"><code>{{ formattedContent }}</code></pre>
      </div>
    </div>
    <ArtifactVersionDiffDialog ref="versionDiffDialog" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import { ChatLineSquare, CopyDocument, Download, EditPen, Minus, Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ArtifactRef, TechDesignAnnotation, TechDesignVersion } from '@shared/workflow';
import { apiClient } from '@/api/client';
import ArtifactVersionDiffDialog from '@/components/ArtifactVersionDiffDialog.vue';
import TechDesignAnnotationPanel from '@/components/TechDesignAnnotationPanel.vue';
import TechDesignVersionSelector from '@/components/TechDesignVersionSelector.vue';
import { artifactReadUrl, rewriteMarkdownImageSources } from '@/utils/markdown-assets';
import { applyAnnotationHighlights, createAnnotationAnchor } from '@/utils/tech-design-annotations';

const visible = ref(false);
const loading = ref(false);
const artifact = ref<ArtifactRef>();
const content = ref('');
const markdownPreviewRef = ref<HTMLElement>();
const versionDiffDialog = ref<InstanceType<typeof ArtifactVersionDiffDialog>>();
const techDesignVersions = ref<TechDesignVersion[]>([]);
const selectedVersionId = ref('current');
const selectedVersion = ref<TechDesignVersion>();
const techDesignAnnotations = ref<TechDesignAnnotation[]>([]);
const annotationHash = ref('');
const loadingVersions = ref(false);
const selectionDraft = ref<ReturnType<typeof createAnnotationAnchor>>();
const annotationPanelVisible = ref(true);
const eyeCareStorageKey = 'ai-delivery-preview-eye-care';
const minZoomPercent = 60;
const maxZoomPercent = 400;
const defaultZoomPercent = 100;
const zoomStepPercent = 10;
const sequenceReadableZoomThreshold = 130;
const sequenceReadableScale = 0.1;
const sequenceReadableMinWidth = 2300;
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
      const code = token.content.trim();
      const diagramType = detectMermaidDiagramType(code);
      const sequenceClass = diagramType === 'sequence' ? ' mermaid-sequence-diagram' : '';
      return `<div class="mermaid mermaid-diagram${sequenceClass}" data-mermaid-type="${diagramType}">${md.utils.escapeHtml(code)}</div>`;
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

const artifactUrl = computed(() => (artifact.value ? artifactReadUrl(artifact.value.path) : ''));
const isMarkdown = computed(() => artifact.value?.kind === 'markdown' || ['.md', '.markdown'].includes(extension.value));
const isHtml = computed(() => artifact.value?.kind === 'html' || extension.value === '.html');
const isPdf = computed(() => extension.value === '.pdf');
const isImage = computed(() => artifact.value?.kind === 'image' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension.value));
const requirementId = computed(() => artifact.value?.path.match(/^docs\/([^/]+)\//)?.[1] || '');
const isTechDesignMarkdown = computed(() =>
  Boolean(isMarkdown.value && artifact.value?.path.replace(/\\/g, '/').match(/^docs\/[^/]+\/technical-design\/design_review\.md$/))
);
const zoomScale = computed(() => zoomPercent.value / 100);
const zoomStageStyle = computed<Record<string, string>>(() => ({
  '--preview-zoom-scale': String(zoomScale.value),
  zoom: String(zoomScale.value)
}));

const previewHtml = computed(() => {
  const rendered = md.render(content.value || '');
  return rewriteMarkdownImageSources(rendered, artifact.value?.path);
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

const versionText = computed(() => {
  if (!artifact.value) {
    return '';
  }
  const segments: string[] = [];
  if (artifact.value.currentVersionNo) {
    segments.push(`v${artifact.value.currentVersionNo}`);
  }
  if (artifact.value.versionCount) {
    segments.push(`${artifact.value.versionCount} 个版本`);
  }
  if (artifact.value.createdBy) {
    segments.push(`创建人 ${artifact.value.createdBy}`);
  }
  if (artifact.value.sourceRunId) {
    segments.push(`run ${artifact.value.sourceRunId}`);
  }
  return segments.join(' · ');
});

function annotationMatchesSelectedVersion(annotation: TechDesignAnnotation): boolean {
  const version = selectedVersion.value || techDesignVersions.value.find((item) => item.id === selectedVersionId.value);
  if (!version) {
    return annotation.versionId === selectedVersionId.value;
  }
  if (version.contentHash && annotation.contentHash) {
    return version.contentHash === annotation.contentHash;
  }
  return annotation.versionId === version.id;
}

const selectedVersionAnnotations = computed(() => techDesignAnnotations.value.filter(annotationMatchesSelectedVersion));

watch(previewHtml, async () => {
  if (!visible.value || !isMarkdown.value) {
    return;
  }
  await nextTick();
  try {
    const mermaidNodes = markdownPreviewRef.value ? Array.from(markdownPreviewRef.value.querySelectorAll<HTMLElement>('.mermaid')) : [];
    await mermaid.run(mermaidNodes.length ? { nodes: mermaidNodes } : undefined);
    enhanceMermaidDiagrams();
  } catch (error) {
    console.error('Mermaid rendering error:', error);
  }
  applyAnnotationMarks();
});

watch(selectedVersionId, async () => {
  if (!visible.value || !isTechDesignMarkdown.value || !selectedVersionId.value) {
    return;
  }
  await loadSelectedTechDesignVersion();
});

watch(eyeCareMode, (value) => {
  try {
    globalThis.localStorage?.setItem(eyeCareStorageKey, value ? '1' : '0');
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
});

function clampZoom(value: number) {
  return Math.min(maxZoomPercent, Math.max(minZoomPercent, value));
}

function setZoom(value: number) {
  zoomPercent.value = clampZoom(value);
  void nextTick().then(enhanceMermaidDiagrams);
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

function detectMermaidDiagramType(code: string) {
  const firstDiagramLine = code
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'));
  return firstDiagramLine?.toLowerCase().startsWith('sequencediagram') ? 'sequence' : 'default';
}

function readSvgNumericValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const match = value.match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

function readSvgNaturalWidth(svg: SVGElement) {
  const cachedWidth = readSvgNumericValue(svg.getAttribute('data-natural-width'));
  if (cachedWidth > 0) {
    return cachedWidth;
  }
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
  const viewBoxWidth = viewBox?.length === 4 ? viewBox[2] : 0;
  const width = readSvgNumericValue(svg.getAttribute('width'));
  const maxWidth = readSvgNumericValue(svg.style.maxWidth);
  const naturalWidth = Math.max(viewBoxWidth || 0, width || 0, maxWidth || 0);
  if (naturalWidth > 0) {
    svg.setAttribute('data-natural-width', String(naturalWidth));
  }
  return naturalWidth;
}

function enhanceMermaidDiagrams() {
  if (!markdownPreviewRef.value) {
    return;
  }
  markdownPreviewRef.value.querySelectorAll<HTMLElement>('.mermaid-diagram').forEach((diagram) => {
    const svg = diagram.querySelector<SVGElement>('svg');
    if (!svg) {
      return;
    }
    const shouldUseReadableSequenceSize = diagram.dataset.mermaidType === 'sequence' && zoomPercent.value >= sequenceReadableZoomThreshold;
    if (shouldUseReadableSequenceSize) {
      const naturalWidth = readSvgNaturalWidth(svg);
      const targetWidth = Math.ceil(Math.max(naturalWidth * sequenceReadableScale, sequenceReadableMinWidth));
      svg.style.width = `${targetWidth}px`;
      svg.style.minWidth = `${targetWidth}px`;
      svg.style.maxWidth = 'none';
      svg.style.height = 'auto';
      return;
    }
    svg.style.width = '';
    svg.style.minWidth = '';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  });
}

function handleZoomShortcut(event: KeyboardEvent) {
  if (!visible.value || (!event.metaKey && !event.ctrlKey)) {
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

onMounted(() => {
  window.addEventListener('keydown', handleZoomShortcut);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleZoomShortcut);
});

async function open(nextArtifact: ArtifactRef) {
  artifact.value = nextArtifact;
  content.value = '';
  techDesignVersions.value = [];
  techDesignAnnotations.value = [];
  annotationHash.value = '';
  selectionDraft.value = undefined;
  selectedVersion.value = undefined;
  selectedVersionId.value = 'current';
  annotationPanelVisible.value = true;
  resetZoom();
  if (!nextArtifact.exists) {
    ElMessage.warning('文件尚未生成');
    return;
  }
  visible.value = true;
  if (isImage.value || isPdf.value || isHtml.value) {
    return;
  }
  if (isTechDesignMarkdown.value) {
    await loadTechDesignPreviewContext();
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

async function loadTechDesignPreviewContext() {
  if (!requirementId.value) {
    return;
  }
  loading.value = true;
  loadingVersions.value = true;
  try {
    const [versionResult, annotationResult] = await Promise.all([
      apiClient.listTechDesignVersions(requirementId.value),
      apiClient.listTechDesignAnnotations(requirementId.value)
    ]);
    techDesignVersions.value = versionResult.versions;
    techDesignAnnotations.value = annotationResult.annotations;
    annotationHash.value = annotationResult.hash;
    const preferred = techDesignVersions.value.find((version) => version.id === 'current' && version.readable) || techDesignVersions.value.find((version) => version.readable);
    selectedVersionId.value = preferred?.id || 'current';
    await loadSelectedTechDesignVersion();
  } catch (error: any) {
    ElMessage.error(error.message || '读取技术方案版本失败');
  } finally {
    loading.value = false;
    loadingVersions.value = false;
  }
}

async function loadSelectedTechDesignVersion() {
  if (!requirementId.value || !selectedVersionId.value) {
    return;
  }
  loading.value = true;
  try {
    const result = await apiClient.readTechDesignVersion(requirementId.value, selectedVersionId.value);
    content.value = result.content;
    selectedVersion.value = result.version;
    const index = techDesignVersions.value.findIndex((version) => version.id === result.version.id);
    if (index >= 0) {
      techDesignVersions.value[index] = {
        ...techDesignVersions.value[index],
        ...result.version
      };
    }
  } catch (error: any) {
    ElMessage.error(error.message || '读取技术方案版本失败');
  } finally {
    loading.value = false;
  }
}

function captureSelection() {
  if (!isTechDesignMarkdown.value || !markdownPreviewRef.value) {
    selectionDraft.value = undefined;
    return;
  }
  selectionDraft.value = createAnnotationAnchor(markdownPreviewRef.value);
}

async function createAnnotationFromSelection() {
  if (!requirementId.value || !selectionDraft.value) {
    return;
  }
  try {
    const result = await ElMessageBox.prompt('记录针对所选文案的批注意见', '新增技术方案批注', {
      inputType: 'textarea',
      inputPlaceholder: '请输入批注意见',
      confirmButtonText: '保存',
      cancelButtonText: '取消'
    });
    const comment = String(result.value || '').trim();
    if (!comment) {
      ElMessage.warning('请输入批注意见');
      return;
    }
    const response = await apiClient.createTechDesignAnnotation(requirementId.value, {
      versionId: selectedVersionId.value,
      selectedText: selectionDraft.value.selectedText,
      anchor: selectionDraft.value.anchor,
      comment,
      includeInNextGeneration: true,
      expectedHash: annotationHash.value
    });
    techDesignAnnotations.value = response.annotations;
    annotationHash.value = response.hash;
    window.getSelection()?.removeAllRanges();
    selectionDraft.value = undefined;
    annotationPanelVisible.value = true;
    await nextTick();
    applyAnnotationMarks();
    ElMessage.success('批注已保存');
  } catch (error: any) {
    if (error === 'cancel' || error?.message === 'cancel') {
      return;
    }
    ElMessage.error(error.message || '保存批注失败');
  }
}

async function resolveAnnotation(annotation: TechDesignAnnotation) {
  await updateAnnotation(annotation, { status: 'RESOLVED', includeInNextGeneration: false });
}

async function toggleAnnotationInclude(annotation: TechDesignAnnotation, include: boolean) {
  await updateAnnotation(annotation, { includeInNextGeneration: include });
}

function toggleAnnotationPanel() {
  annotationPanelVisible.value = !annotationPanelVisible.value;
}

async function updateAnnotation(annotation: TechDesignAnnotation, input: { status?: TechDesignAnnotation['status']; includeInNextGeneration?: boolean }) {
  if (!requirementId.value) {
    return;
  }
  try {
    const response = await apiClient.updateTechDesignAnnotationStatus(requirementId.value, annotation.id, {
      ...input,
      expectedHash: annotationHash.value
    });
    techDesignAnnotations.value = response.annotations;
    annotationHash.value = response.hash;
    await nextTick();
    applyAnnotationMarks();
  } catch (error: any) {
    ElMessage.error(error.message || '更新批注失败');
  }
}

async function deleteAnnotation(annotation: TechDesignAnnotation) {
  if (!requirementId.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('删除后该批注不会再显示，也不会进入下一次技术方案生成。确认删除吗？', '删除技术方案批注', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
    const response = await apiClient.deleteTechDesignAnnotation(requirementId.value, annotation.id, {
      expectedHash: annotationHash.value
    });
    techDesignAnnotations.value = response.annotations;
    annotationHash.value = response.hash;
    await nextTick();
    applyAnnotationMarks();
    ElMessage.success('批注已删除');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close' || error?.message === 'cancel' || error?.message === 'close') {
      return;
    }
    ElMessage.error(error.message || '删除批注失败');
  }
}

function applyAnnotationMarks() {
  if (!isTechDesignMarkdown.value || !markdownPreviewRef.value) {
    return;
  }
  applyAnnotationHighlights(markdownPreviewRef.value, selectedVersionAnnotations.value, selectedVersion.value?.contentHash);
}

function locateAnnotation(annotation: TechDesignAnnotation) {
  const target = markdownPreviewRef.value?.querySelector(`[data-annotation-id="${annotation.id}"]`);
  if (!target) {
    ElMessage.warning('当前版本未定位到该批注文案');
    return;
  }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function openVersionDiff() {
  if (!requirementId.value) {
    return;
  }
  versionDiffDialog.value?.open(requirementId.value, techDesignVersions.value, selectedVersionId.value);
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

.version-summary {
  color: #2563eb;
}

.preview-header-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.preview-zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: #ffffff;
}

.zoom-percent {
  min-width: 44px;
  color: #394b63;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.eye-care-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  color: #50617a;
  background: #ffffff;
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

.preview-dialog-body {
  height: calc(100vh - 96px);
  min-height: 0;
  overflow: auto;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #ffffff;
}

.preview-dialog-body.eye-care {
  border-color: #d9cdb4;
  background: #f4eddd;
}

.tech-design-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 22vw, 420px);
  height: 100%;
  min-height: 0;
}

.tech-design-preview-layout.annotation-panel-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.tech-design-preview-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.preview-zoom-stage {
  width: 100%;
  height: 100%;
  min-height: 100%;
  transform-origin: top left;
}

.artifact-markdown {
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  min-height: 100%;
  margin: 0;
  padding: 28px;
  background: #ffffff;
}

.preview-dialog-body.eye-care .artifact-markdown {
  color: #26362f;
  background: #f8f1df;
}

.preview-dialog-body.eye-care .artifact-markdown :deep(h1),
.preview-dialog-body.eye-care .artifact-markdown :deep(h2),
.preview-dialog-body.eye-care .artifact-markdown :deep(h3),
.preview-dialog-body.eye-care .artifact-markdown :deep(h4) {
  color: #1e3029;
}

.preview-dialog-body.eye-care .artifact-markdown :deep(code),
.preview-dialog-body.eye-care .artifact-markdown :deep(pre) {
  color: #26423c;
  background: #ede3cc;
}

.preview-dialog-body.eye-care .artifact-markdown :deep(blockquote),
.preview-dialog-body.eye-care .artifact-markdown :deep(table) {
  border-color: #d4c3a5;
  background: #f1e7d1;
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

.artifact-markdown :deep(.mermaid-sequence-diagram) {
  scrollbar-gutter: stable;
}

.preview-dialog-body.eye-care .artifact-markdown :deep(.mermaid-diagram) {
  color: #26362f;
}

.artifact-markdown :deep(.tech-design-annotation-highlight) {
  padding: 1px 2px;
  border-radius: 3px;
  background: #fef08a;
  box-shadow: inset 0 -1px 0 #f59e0b;
}

.artifact-frame {
  display: block;
  width: 100%;
  height: 100%;
  min-height: calc(100vh - 116px);
  border: 0;
  background: #ffffff;
}

.preview-dialog-body.eye-care .artifact-frame {
  background: #f4eddd;
}

.artifact-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  background: #f8fafc;
}

.preview-dialog-body.eye-care .artifact-image-wrap {
  background: #f4eddd;
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

.preview-dialog-body.eye-care .artifact-code {
  color: #253a35;
  background: #f8f1df;
}

@media (max-width: 760px) {
  .preview-dialog-header {
    flex-direction: column;
    padding-right: 32px;
  }

  .preview-header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .preview-header-actions .el-button {
    flex: 1;
  }

  .preview-zoom-controls {
    width: 100%;
    justify-content: center;
  }

  .preview-zoom-controls .el-button {
    flex: 0 0 auto;
  }

  .tech-design-preview-layout {
    grid-template-columns: 1fr;
  }

  .artifact-markdown {
    padding: 18px;
  }
}
</style>
