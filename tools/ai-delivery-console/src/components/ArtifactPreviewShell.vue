<template>
  <section class="artifact-preview-shell" :class="{ 'eye-care': eyeCareMode }">
    <header class="preview-toolbar">
      <div class="preview-title">
        <strong>{{ artifact?.label || '产物预览' }}</strong>
        <p>{{ artifact?.path || '未选择文件' }}</p>
        <p v-if="versionText" class="version-text">{{ versionText }}</p>
      </div>
      <div class="preview-actions">
        <el-radio-group
          v-if="isMarkdown"
          class="preview-reading-mode"
          :model-value="readingMode"
          size="small"
          aria-label="产物阅读模式"
          @change="changeReadingMode"
        >
          <el-radio-button value="RICH" @click="changeReadingMode('RICH')">HTML 预览</el-radio-button>
          <el-radio-button value="CLASSIC" @click="changeReadingMode('CLASSIC')">Markdown 预览</el-radio-button>
        </el-radio-group>
        <TechDesignVersionSelector
          v-if="isPrivateTechDesignMarkdown"
          v-model="selectedVersionId"
          :versions="techDesignVersions"
          :loading="loadingVersions"
          @compare="openVersionDiff"
        />
        <el-button v-if="isTechDesignMarkdown && showAnnotationControls" :icon="ChatLineSquare" @click="toggleAnnotationPanel">
          批注 {{ selectedVersionAnnotations.length }}
        </el-button>
        <el-button
          v-if="isTechDesignMarkdown && showAnnotationControls"
          :disabled="createAnnotationDisabled"
          :icon="EditPen"
          @click="createAnnotationFromSelection"
        >
          新增批注
        </el-button>
        <el-button v-if="canShare" :icon="Share" @click="$emit('share')">分享</el-button>
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
        <el-dropdown v-if="isMarkdown && allowDownload" trigger="click" :disabled="!artifact?.exists" @command="downloadMarkdownArtifact">
          <el-button :disabled="!artifact?.exists" :icon="Download">下载</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
              <el-dropdown-item command="html">HTML</el-dropdown-item>
              <el-dropdown-item command="pdf">PDF</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-else-if="allowDownload" :disabled="!artifact?.exists" :icon="Download" @click="downloadOriginalArtifact">下载</el-button>
      </div>
    </header>

    <div v-loading="effectiveLoading" class="preview-body preview-dialog-body" :class="{ 'eye-care': eyeCareMode }">
      <div
        class="preview-layout tech-design-preview-layout"
        :class="{
          'with-outline': showOutline,
          'outline-collapsed': outlineCollapsed,
          'with-annotations': showAnnotationPanel,
          'annotation-panel-collapsed': isTechDesignMarkdown && !annotationPanelVisible
        }"
      >
        <MarkdownOutlineNav
          v-if="showOutline"
          v-model:collapsed="outlineCollapsed"
          :items="outlineItems"
          :active-id="activeOutlineId"
          @select="scrollToOutlineItem"
        />
        <div ref="previewScrollRef" class="preview-scroll" @scroll="hideSelectionMenu">
          <div class="preview-zoom-stage" :style="zoomStageStyle">
            <article
              v-if="isMarkdown"
              ref="markdownPreviewRef"
              class="markdown-preview artifact-markdown"
              :class="readingModeClass"
              v-html="previewHtml"
              @click="handleMarkdownPreviewClick"
              @mouseup="captureSelection"
              @keyup="captureSelection"
            ></article>
            <iframe v-else-if="isHtml" class="artifact-frame" :src="htmlPreviewUrl" title="产物预览"></iframe>
            <iframe v-else-if="isPdf" class="artifact-frame" :src="assetUrl" title="产物预览"></iframe>
            <div v-else-if="isImage" class="artifact-image-wrap">
              <img :src="assetUrl" :alt="artifact?.label || '产物图片'" />
            </div>
            <pre v-else class="artifact-code"><code>{{ formattedContent }}</code></pre>
          </div>
        </div>
        <TechDesignAnnotationPanel
          v-if="showAnnotationPanel"
          ref="annotationPanelRef"
          :annotations="selectedVersionAnnotations"
          :deletable-annotation-ids="deletableAnnotationIds"
          :deletable-reply-ids="deletableReplyIds"
          :replyable-annotation-ids="replyableAnnotationIds"
          :readonly="annotationPanelReadonly"
          @collapse="annotationPanelVisible = false"
          @delete="deleteAnnotation"
          @delete-reply="deleteAnnotationReply"
          @locate="locateAnnotation"
          @reply="replyToAnnotation"
          @resolve="resolveAnnotation"
          @toggle-include="toggleAnnotationInclude"
        />
      </div>
    </div>
    <div
      v-if="selectionMenu.visible && selectionDraft"
      class="selection-annotation-menu"
      :style="selectionMenuStyle"
      @mousedown.prevent
      @click.stop
    >
      <button type="button" class="selection-annotation-menu__button" @click="createAnnotationFromSelection">
        {{ selectionAnnotationMenuText }}
      </button>
    </div>
    <ArtifactVersionDiffDialog ref="versionDiffDialog" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import { ChatLineSquare, CopyDocument, Download, EditPen, Minus, Plus, Refresh, Share } from '@element-plus/icons-vue';
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElMessage, ElMessageBox } from 'element-plus';
import type { ArtifactRef, TechDesignAnnotation, TechDesignAnnotationReply, TechDesignVersion } from '@shared/workflow';
import { apiClient } from '@/api/client';
import ArtifactVersionDiffDialog from '@/components/ArtifactVersionDiffDialog.vue';
import MarkdownOutlineNav from '@/components/MarkdownOutlineNav.vue';
import TechDesignAnnotationPanel from '@/components/TechDesignAnnotationPanel.vue';
import TechDesignVersionSelector from '@/components/TechDesignVersionSelector.vue';
import { TECH_DESIGN_ANNOTATION_CHANGED_EVENT, type TechDesignAnnotationChangedDetail } from '@/services/annotation-realtime';
import {
  artifactMarkdownRenderCache,
  artifactMermaidSvgCache,
  createPreviewCacheKey,
  escapePreviewHtml,
  renderMarkdownSafely,
  stableTextHash
} from '@/utils/artifact-preview-rendering';
import { artifactReadUrl, artifactViewUrl, publicArtifactAssetUrl, publicArtifactViewUrl, rewriteMarkdownImageSources } from '@/utils/markdown-assets';
import { applyAnnotationHighlights, createAnnotationAnchor } from '@/utils/tech-design-annotations';

type DownloadFormat = 'markdown' | 'html' | 'pdf';
type ReadingMode = 'RICH' | 'CLASSIC';

interface MarkdownOutlineItem {
  id: string;
  level: number;
  text: string;
}

interface SelectionMenuState {
  visible: boolean;
  top: number;
  left: number;
}

interface ClientRectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

const props = withDefaults(
  defineProps<{
    artifact?: ArtifactRef;
    content?: string;
    loading?: boolean;
    allowDownload?: boolean;
    canShare?: boolean;
    publicToken?: string;
    projectId?: string | number;
    requirementPk?: string | number;
    showAnnotations?: boolean;
    canCreateAnnotation?: boolean;
    currentUserId?: string | number;
    publicShareId?: string | number;
  }>(),
  {
    artifact: undefined,
    content: '',
    loading: false,
    allowDownload: true,
    canShare: false,
    publicToken: '',
    projectId: '',
    requirementPk: '',
    showAnnotations: true,
    canCreateAnnotation: false,
    currentUserId: '',
    publicShareId: ''
  }
);

const emit = defineEmits<{
  (event: 'share'): void;
  (event: 'login-required'): void;
}>();

const markdownPreviewRef = ref<HTMLElement>();
const previewScrollRef = ref<HTMLElement>();
const annotationPanelRef = ref<{ focusAnnotation: (annotationId: string) => void }>();
const versionDiffDialog = ref<InstanceType<typeof ArtifactVersionDiffDialog>>();
const eyeCareStorageKey = 'ai-delivery-preview-eye-care';
const outlineStorageKey = 'ai-delivery-preview-outline-collapsed';
const minZoomPercent = 60;
const maxZoomPercent = 400;
const defaultZoomPercent = 100;
const zoomStepPercent = 10;
const sequenceReadableZoomThreshold = 130;
const sequenceReadableScale = 0.1;
const sequenceReadableMinWidth = 2300;
const sequenceDiagramMinZoomPercent = 60;
const sequenceDiagramMaxZoomPercent = 300;
const sequenceDiagramDefaultZoomPercent = 100;
const sequenceDiagramZoomStepPercent = 10;
const markdownRendererVersion = 'markdown-v1';
const mermaidRendererVersion = 'mermaid-v1';
const mermaidTheme = 'default';
const zoomPercent = ref(defaultZoomPercent);
const readingMode = ref<ReadingMode>('RICH');
const internalContent = ref('');
const internalLoading = ref(false);
const loadingVersions = ref(false);
const techDesignVersions = ref<TechDesignVersion[]>([]);
const selectedVersionId = ref('current');
const selectedVersion = ref<TechDesignVersion>();
const techDesignAnnotations = ref<TechDesignAnnotation[]>([]);
const annotationHash = ref('');
const selectionDraft = ref<ReturnType<typeof createAnnotationAnchor>>();
const selectionMenu = ref<SelectionMenuState>({ visible: false, top: 0, left: 0 });
const annotationPanelVisible = ref(true);
const outlineItems = ref<MarkdownOutlineItem[]>([]);
const activeOutlineId = ref('');
let outlineObserver: IntersectionObserver | undefined;
let renderGeneration = 0;
let richPreviewWarningPath = '';
let markdownFallbackWarningKey = '';
let annotationHighlightFlashTimer: ReturnType<typeof setTimeout> | undefined;

function readEyeCareMode() {
  try {
    return globalThis.localStorage?.getItem(eyeCareStorageKey) === '1';
  } catch {
    return false;
  }
}

function readOutlineCollapsed() {
  try {
    return globalThis.localStorage?.getItem(outlineStorageKey) === '1';
  } catch {
    return false;
  }
}

const eyeCareMode = ref(readEyeCareMode());
const outlineCollapsed = ref(readOutlineCollapsed());

mermaid.initialize({
  startOnLoad: false,
  theme: mermaidTheme,
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
  const filePath = props.artifact?.path || '';
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : '';
});
const isMarkdown = computed(() => props.artifact?.kind === 'markdown' || ['.md', '.markdown'].includes(extension.value));
const isHtml = computed(() => props.artifact?.kind === 'html' || ['.html', '.htm'].includes(extension.value));
const isPdf = computed(() => extension.value === '.pdf');
const isImage = computed(() => props.artifact?.kind === 'image' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension.value));
const requirementId = computed(() => props.artifact?.path.match(/^docs\/([^/]+)\//)?.[1] || '');
const requirementPk = computed(() => (props.requirementPk == null || props.requirementPk === '' ? '' : String(props.requirementPk)));
const isTechDesignMarkdown = computed(() =>
  Boolean(isMarkdown.value && props.artifact?.path.replace(/\\/g, '/').match(/^docs\/[^/]+\/technical-design\/design_review\.md$/))
);
const isPublicPreview = computed(() => Boolean(props.publicToken));
const isPrivateTechDesignMarkdown = computed(() => isTechDesignMarkdown.value && !isPublicPreview.value);
const readingModeClass = computed(() =>
  readingMode.value === 'RICH' ? 'artifact-markdown--rich' : 'artifact-markdown--classic'
);
const effectiveContent = computed(() => internalContent.value || props.content || '');
const effectiveLoading = computed(() => props.loading || internalLoading.value || loadingVersions.value);
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
const htmlPreviewUrl = computed(() => {
  if (!props.artifact?.path) {
    return '';
  }
  return props.publicToken ? publicArtifactViewUrl(props.publicToken, props.artifact.path) : artifactViewUrl(props.artifact.path, props.projectId);
});
const markdownRenderResult = computed(() => {
  if (!isMarkdown.value) {
    return { html: '', cacheKey: '', fromCache: false, degraded: false, error: undefined };
  }
  return renderMarkdownSafely({
    content: effectiveContent.value || '',
    rendererVersion: markdownRendererVersion,
    cache: artifactMarkdownRenderCache,
    render: (content) => md.render(content)
  });
});
const previewHtml = computed(() => {
  const rendered = markdownRenderResult.value.html;
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
      return JSON.stringify(JSON.parse(effectiveContent.value || ''), null, 2);
    } catch {
      return effectiveContent.value || '';
    }
  }
  return effectiveContent.value || '';
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
const showAnnotationControls = computed(() => props.showAnnotations !== false);
const annotationPanelReadonly = computed(() => isPublicPreview.value);
const showAnnotationPanel = computed(() => Boolean(isTechDesignMarkdown.value && showAnnotationControls.value && annotationPanelVisible.value));
const showOutline = computed(() => Boolean(isMarkdown.value && outlineItems.value.length));
const selectedVersionAnnotations = computed(() => techDesignAnnotations.value.filter(annotationMatchesSelectedVersion));
const deletableAnnotationIds = computed(() => {
  if (!isPublicPreview.value || !props.canCreateAnnotation || !props.currentUserId) {
    return [];
  }
  const currentUserId = String(props.currentUserId);
  return selectedVersionAnnotations.value
    .filter((annotation) => annotation.createdBy != null && String(annotation.createdBy) === currentUserId)
    .map((annotation) => annotation.id);
});
const deletableReplyIds = computed(() => {
  if (!isPublicPreview.value || !props.canCreateAnnotation || !props.currentUserId) {
    return [];
  }
  const currentUserId = String(props.currentUserId);
  return selectedVersionAnnotations.value.flatMap((annotation) =>
    (annotation.replies || [])
      .filter((reply) => reply.createdBy != null && String(reply.createdBy) === currentUserId)
      .map((reply) => reply.id)
  );
});
const replyableAnnotationIds = computed(() => {
  if (!isPublicPreview.value || !props.canCreateAnnotation) {
    return [];
  }
  return selectedVersionAnnotations.value.map((annotation) => annotation.id);
});
const createAnnotationDisabled = computed(() => {
  if (isPublicPreview.value && !props.canCreateAnnotation) {
    return false;
  }
  return !selectionDraft.value;
});
const selectionAnnotationMenuText = computed(() => (isPublicPreview.value && !props.canCreateAnnotation ? '登录后批注' : '批注'));
const selectionMenuStyle = computed<Record<string, string>>(() => ({
  top: `${selectionMenu.value.top}px`,
  left: `${selectionMenu.value.left}px`
}));

watch(
  previewHtml,
  async () => {
    const generation = ++renderGeneration;
    await nextTick();
    rebuildOutline();
    applyAnnotationMarks();
    enhanceRichPreview();
    void renderMermaidDiagrams(generation)
      .then(() => {
        if (generation === renderGeneration) {
          applyAnnotationMarks();
          enhanceRichPreview();
        }
      })
      .catch((error) => logPreviewRenderError('mermaid-batch', error));
  },
  { immediate: true }
);

watch(
  markdownRenderResult,
  (result) => {
    if (!result.degraded || !result.cacheKey || result.cacheKey === markdownFallbackWarningKey) {
      return;
    }
    markdownFallbackWarningKey = result.cacheKey;
    readingMode.value = 'CLASSIC';
    logPreviewRenderError('markdown-fallback', result.error);
    ElMessage.warning('文档渲染异常，已使用安全文本模式展示');
  },
  { immediate: true }
);

watch(
  () => [props.artifact?.path, props.projectId, props.publicToken, props.showAnnotations, props.content],
  () => {
    resetPreviewContext();
    void loadTechDesignContext();
  },
  { immediate: true }
);

watch(
  () => props.artifact?.path,
  (nextPath, previousPath) => {
    if (nextPath !== previousPath) {
      readingMode.value = 'RICH';
    }
  }
);

watch(selectedVersionId, async () => {
  clearSelectionDraft();
  if (!isPrivateTechDesignMarkdown.value || !selectedVersionId.value) {
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

watch(outlineCollapsed, (value) => {
  try {
    globalThis.localStorage?.setItem(outlineStorageKey, value ? '1' : '0');
  } catch {
    // ignored
  }
});

function setZoom(value: number) {
  hideSelectionMenu();
  zoomPercent.value = Math.min(maxZoomPercent, Math.max(minZoomPercent, value));
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

async function changeReadingMode(value: string | number | boolean | undefined) {
  const nextMode: ReadingMode = value === 'CLASSIC' ? 'CLASSIC' : 'RICH';
  if (nextMode === readingMode.value) {
    return;
  }
  const scroller = previewScrollRef.value;
  const scrollTop = scroller?.scrollTop || 0;
  readingMode.value = nextMode;
  await nextTick();
  if (scroller) {
    scroller.scrollTop = scrollTop;
  }
  enhanceRichPreview();
}

function resetPreviewContext() {
  internalContent.value = '';
  techDesignVersions.value = [];
  selectedVersion.value = undefined;
  selectedVersionId.value = 'current';
  techDesignAnnotations.value = [];
  annotationHash.value = '';
  clearSelectionDraft();
  annotationPanelVisible.value = true;
  outlineItems.value = [];
  activeOutlineId.value = '';
}

async function loadTechDesignContext() {
  if (!isTechDesignMarkdown.value || !requirementId.value || !props.artifact?.exists) {
    return;
  }
  if (isPublicPreview.value) {
    internalContent.value = props.content || '';
    if (props.showAnnotations !== false && props.publicToken) {
      await refreshPublicAnnotations();
    }
    return;
  }
  internalLoading.value = true;
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
    ElMessage.error(error.message || '读取技术方案预览失败');
  } finally {
    internalLoading.value = false;
    loadingVersions.value = false;
  }
}

async function loadSelectedTechDesignVersion() {
  if (!requirementId.value || !selectedVersionId.value || !isPrivateTechDesignMarkdown.value) {
    return;
  }
  internalLoading.value = true;
  try {
    const result = await apiClient.readTechDesignVersion(requirementId.value, selectedVersionId.value);
    internalContent.value = result.content;
    selectedVersion.value = result.version;
    const index = techDesignVersions.value.findIndex((version) => version.id === result.version.id);
    if (index >= 0) {
      techDesignVersions.value[index] = { ...techDesignVersions.value[index], ...result.version };
    }
  } catch (error: any) {
    ElMessage.error(error.message || '读取技术方案版本失败');
  } finally {
    internalLoading.value = false;
  }
}

async function refreshPublicAnnotations() {
  if (!props.publicToken || props.showAnnotations === false) {
    techDesignAnnotations.value = [];
    annotationHash.value = '';
    return;
  }
  try {
    const result = await apiClient.listPublicTechDesignAnnotations(props.publicToken, selectedVersionId.value || 'current');
    techDesignAnnotations.value = result.annotations;
    annotationHash.value = result.hash;
    await nextTick();
    applyAnnotationMarks();
  } catch (error: any) {
    if (error.code !== 'B70082') {
      ElMessage.error(error.message || '读取公开批注失败');
    }
    techDesignAnnotations.value = [];
    annotationHash.value = '';
  }
}

async function refreshTechDesignAnnotations() {
  if (!isTechDesignMarkdown.value) {
    return;
  }
  if (isPublicPreview.value) {
    await refreshPublicAnnotations();
    return;
  }
  if (!requirementId.value) {
    return;
  }
  const result = await apiClient.listTechDesignAnnotations(requirementId.value);
  techDesignAnnotations.value = result.annotations;
  annotationHash.value = result.hash;
  await nextTick();
  applyAnnotationMarks();
}

function annotationEventMatchesCurrentPreview(detail: TechDesignAnnotationChangedDetail | undefined) {
  if (!detail) {
    return false;
  }
  if (isPublicPreview.value) {
    return detail.shareId != null && Boolean(props.publicShareId) && String(detail.shareId) === String(props.publicShareId);
  }
  const matchesRequirementId = detail.requirementId != null && String(detail.requirementId) === requirementId.value;
  const matchesRequirementPk = detail.requirementPk != null && Boolean(requirementPk.value) && String(detail.requirementPk) === requirementPk.value;
  return matchesRequirementId || matchesRequirementPk;
}

function handleTechDesignAnnotationChanged(event: Event) {
  if (!isTechDesignMarkdown.value || !annotationEventMatchesCurrentPreview((event as CustomEvent<TechDesignAnnotationChangedDetail>).detail)) {
    return;
  }
  void refreshTechDesignAnnotations().catch((error: Error) => {
    ElMessage.error(error.message || '刷新批注失败');
  });
}

function logPreviewRenderError(stage: string, error: unknown) {
  console.error('Artifact preview rendering error', {
    stage,
    path: props.artifact?.path || '',
    contentHash: props.artifact?.hash || stableTextHash(effectiveContent.value || ''),
    message: error instanceof Error ? error.message : String(error || 'unknown error')
  });
}

function enhanceRichPreview() {
  if (readingMode.value !== 'RICH' || !markdownPreviewRef.value) {
    return;
  }
  try {
    markdownPreviewRef.value.querySelectorAll<HTMLElement>('table, blockquote, pre').forEach((element) => {
      element.dataset.richPreview = 'true';
    });
  } catch (error) {
    readingMode.value = 'CLASSIC';
    logPreviewRenderError('rich-enhancement', error);
    const artifactPath = props.artifact?.path || 'unknown';
    if (richPreviewWarningPath !== artifactPath) {
      richPreviewWarningPath = artifactPath;
      ElMessage.warning('HTML 精排加载失败，已切换到 Markdown 预览');
    }
  }
}

function showMermaidError(node: HTMLElement, source: string) {
  node.classList.add('mermaid-render-error');
  node.dataset.previewRendered = 'true';
  node.innerHTML = `<div class="mermaid-error-title">图表渲染失败，已保留原始内容</div><pre><code>${escapePreviewHtml(source)}</code></pre>`;
}

async function renderMermaidDiagrams(generation = renderGeneration) {
  const nodes = markdownPreviewRef.value
    ? Array.from(markdownPreviewRef.value.querySelectorAll<HTMLElement>('.mermaid')).filter(
        (node) => node.dataset.previewRendered !== 'true'
      )
    : [];
  for (const node of nodes) {
    if (generation !== renderGeneration || !markdownPreviewRef.value?.contains(node)) {
      return;
    }
    const source = node.textContent?.trim() || '';
    const cacheKey = createPreviewCacheKey('mermaid', source, `${mermaidTheme}:${mermaidRendererVersion}`);
    try {
      const cachedSvg = artifactMermaidSvgCache.get(cacheKey);
      if (cachedSvg != null) {
        node.innerHTML = cachedSvg;
        node.dataset.previewRendered = 'true';
        continue;
      }
    } catch (error) {
      logPreviewRenderError('mermaid-cache-read', error);
    }
    try {
      await mermaid.run({ nodes: [node] });
      if (generation !== renderGeneration || !markdownPreviewRef.value?.contains(node)) {
        return;
      }
      node.dataset.previewRendered = 'true';
      if (node.querySelector('svg')) {
        try {
          artifactMermaidSvgCache.set(cacheKey, node.innerHTML);
        } catch (error) {
          logPreviewRenderError('mermaid-cache-write', error);
        }
      }
      enhanceMermaidDiagrams();
    } catch (error) {
      if (generation !== renderGeneration || !markdownPreviewRef.value?.contains(node)) {
        return;
      }
      logPreviewRenderError('mermaid-diagram', error);
      showMermaidError(node, source);
    }
  }
  enhanceMermaidDiagrams();
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

function clampSequenceDiagramZoomPercent(value: number) {
  return Math.min(sequenceDiagramMaxZoomPercent, Math.max(sequenceDiagramMinZoomPercent, value));
}

function readSequenceDiagramZoomPercent(diagram: HTMLElement) {
  const value = Number(diagram.dataset.sequenceZoomPercent);
  if (!Number.isFinite(value)) {
    return sequenceDiagramDefaultZoomPercent;
  }
  return clampSequenceDiagramZoomPercent(value);
}

function updateSequenceDiagramToolbar(diagram: HTMLElement) {
  const toolbar = diagram.querySelector<HTMLElement>('[data-sequence-zoom-toolbar="true"]');
  if (!toolbar) {
    return;
  }
  const zoom = readSequenceDiagramZoomPercent(diagram);
  const percent = toolbar.querySelector<HTMLElement>('[data-sequence-zoom-percent="true"]');
  const zoomOutButton = toolbar.querySelector<HTMLButtonElement>('[data-sequence-zoom-action="out"]');
  const zoomInButton = toolbar.querySelector<HTMLButtonElement>('[data-sequence-zoom-action="in"]');
  const resetButton = toolbar.querySelector<HTMLButtonElement>('[data-sequence-zoom-action="reset"]');
  if (percent) {
    percent.textContent = `${zoom}%`;
  }
  if (zoomOutButton) {
    zoomOutButton.disabled = zoom <= sequenceDiagramMinZoomPercent;
  }
  if (zoomInButton) {
    zoomInButton.disabled = zoom >= sequenceDiagramMaxZoomPercent;
  }
  if (resetButton) {
    resetButton.disabled = zoom === sequenceDiagramDefaultZoomPercent;
  }
}

function ensureSequenceDiagramToolbar(diagram: HTMLElement) {
  if (diagram.dataset.sequenceZoomPercent == null) {
    diagram.dataset.sequenceZoomPercent = String(sequenceDiagramDefaultZoomPercent);
  }
  if (!diagram.querySelector('[data-sequence-zoom-toolbar="true"]')) {
    const toolbar = document.createElement('div');
    toolbar.className = 'sequence-diagram-toolbar';
    toolbar.dataset.sequenceZoomToolbar = 'true';
    toolbar.setAttribute('aria-label', '时序图缩放');
    toolbar.innerHTML = `
      <button type="button" class="sequence-diagram-zoom-button" data-sequence-zoom-action="out" title="缩小时序图" aria-label="缩小时序图">-</button>
      <span class="sequence-diagram-zoom-percent" data-sequence-zoom-percent="true">100%</span>
      <button type="button" class="sequence-diagram-zoom-button" data-sequence-zoom-action="in" title="放大时序图" aria-label="放大时序图">+</button>
      <button type="button" class="sequence-diagram-reset-button" data-sequence-zoom-action="reset" title="恢复时序图 100%" aria-label="恢复时序图 100%">1:1</button>
    `;
    diagram.prepend(toolbar);
  }
  updateSequenceDiagramToolbar(diagram);
}

function applyMermaidSvgSize(diagram: HTMLElement, svg: SVGElement) {
  const isSequenceDiagram = diagram.dataset.mermaidType === 'sequence';
  if (isSequenceDiagram) {
    const sequenceZoomPercent = readSequenceDiagramZoomPercent(diagram);
    const shouldUseReadableSequenceSize =
      zoomPercent.value >= sequenceReadableZoomThreshold || sequenceZoomPercent !== sequenceDiagramDefaultZoomPercent;
    if (shouldUseReadableSequenceSize) {
      const naturalWidth = readSvgNaturalWidth(svg);
      const baseWidth = Math.ceil(Math.max(naturalWidth * sequenceReadableScale, sequenceReadableMinWidth));
      const targetWidth = Math.ceil(baseWidth * (sequenceZoomPercent / 100));
      svg.style.width = `${targetWidth}px`;
      svg.style.minWidth = `${targetWidth}px`;
      svg.style.maxWidth = 'none';
      svg.style.height = 'auto';
      return;
    }
  }
  svg.style.width = '';
  svg.style.minWidth = '';
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
}

function setSequenceDiagramZoomPercent(diagram: HTMLElement, value: number) {
  hideSelectionMenu();
  diagram.dataset.sequenceZoomPercent = String(clampSequenceDiagramZoomPercent(value));
  const svg = diagram.querySelector<SVGElement>('svg');
  if (svg) {
    applyMermaidSvgSize(diagram, svg);
  }
  updateSequenceDiagramToolbar(diagram);
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
    if (diagram.dataset.mermaidType === 'sequence') {
      ensureSequenceDiagramToolbar(diagram);
    }
    applyMermaidSvgSize(diagram, svg);
  });
}

function slugifyHeading(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

function rebuildOutline() {
  if (!markdownPreviewRef.value || !isMarkdown.value) {
    outlineItems.value = [];
    activeOutlineId.value = '';
    return;
  }
  outlineObserver?.disconnect();
  const seen = new Map<string, number>();
  const headings = Array.from(markdownPreviewRef.value.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));
  outlineItems.value = headings
    .map((heading) => {
      const text = heading.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!text) {
        return undefined;
      }
      const slug = slugifyHeading(text);
      const count = seen.get(slug) || 0;
      seen.set(slug, count + 1);
      const id = heading.id || (count ? `${slug}-${count + 1}` : slug);
      heading.id = id;
      return { id, text, level: Number(heading.tagName.slice(1)) };
    })
    .filter(Boolean) as MarkdownOutlineItem[];
  activeOutlineId.value = outlineItems.value[0]?.id || '';
  if (!outlineItems.value.length) {
    return;
  }
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }
  outlineObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (visible?.target.id) {
        activeOutlineId.value = visible.target.id;
      }
    },
    { root: previewScrollRef.value || null, rootMargin: '0px 0px -70% 0px', threshold: [0, 1] }
  );
  headings.forEach((heading) => outlineObserver?.observe(heading));
}

function scrollToOutlineItem(id: string) {
  const target = Array.from(markdownPreviewRef.value?.querySelectorAll<HTMLElement>('[id]') || []).find((element) => element.id === id);
  scrollPreviewTarget(target, 'start');
  activeOutlineId.value = id;
}

function scrollPreviewTarget(target: HTMLElement | null | undefined, block: 'start' | 'center') {
  const scroller = previewScrollRef.value;
  if (!target || !scroller) {
    return;
  }
  const targetRect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const targetTop = targetRect.top - scrollerRect.top + scroller.scrollTop;
  const top = block === 'center' ? targetTop - (scroller.clientHeight - targetRect.height) / 2 : targetTop;
  const nextTop = Math.max(0, top);
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({ top: nextTop, behavior: 'smooth' });
    return;
  }
  scroller.scrollTop = nextTop;
}

function annotationMatchesSelectedVersion(annotation: TechDesignAnnotation): boolean {
  if (isPublicPreview.value) {
    if (props.artifact?.hash && annotation.contentHash) {
      return props.artifact.hash === annotation.contentHash;
    }
    return annotation.versionId === selectedVersionId.value;
  }
  const version = selectedVersion.value || techDesignVersions.value.find((item) => item.id === selectedVersionId.value);
  if (!version) {
    return annotation.versionId === selectedVersionId.value;
  }
  if (version.contentHash && annotation.contentHash) {
    return version.contentHash === annotation.contentHash;
  }
  return annotation.versionId === version.id;
}

function applyAnnotationMarks() {
  if (!isTechDesignMarkdown.value || !markdownPreviewRef.value || props.showAnnotations === false) {
    return;
  }
  const currentContentHash = isPublicPreview.value ? props.artifact?.hash : selectedVersion.value?.contentHash;
  applyAnnotationHighlights(markdownPreviewRef.value, selectedVersionAnnotations.value, currentContentHash);
}

function hideSelectionMenu() {
  selectionMenu.value = { ...selectionMenu.value, visible: false };
}

function clearSelectionDraft() {
  selectionDraft.value = undefined;
  hideSelectionMenu();
}

function hasUsableSelectionRect(rect: DOMRect | undefined | null): rect is DOMRect {
  return Boolean(rect && Number.isFinite(rect.top) && Number.isFinite(rect.left) && (rect.width > 0 || rect.height > 0));
}

function readSelectionClientRect(event?: Event): ClientRectLike | undefined {
  if (event instanceof MouseEvent && (event.clientX || event.clientY)) {
    return {
      top: event.clientY,
      left: event.clientX,
      width: 0,
      height: 0
    };
  }
  const selection = window.getSelection?.();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    const boundingRect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : undefined;
    if (hasUsableSelectionRect(boundingRect)) {
      return {
        top: boundingRect.top,
        left: boundingRect.left,
        width: boundingRect.width,
        height: boundingRect.height
      };
    }
    const clientRects = typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : [];
    const clientRect = clientRects.find(hasUsableSelectionRect);
    if (clientRect) {
      return {
        top: clientRect.top,
        left: clientRect.left,
        width: clientRect.width,
        height: clientRect.height
      };
    }
  }
  const scrollerRect = previewScrollRef.value?.getBoundingClientRect();
  if (!scrollerRect) {
    return undefined;
  }
  return {
    top: scrollerRect.top + 16,
    left: scrollerRect.left + scrollerRect.width / 2,
    width: 0,
    height: 0
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function showSelectionMenu(event?: Event) {
  if (!showAnnotationControls.value) {
    hideSelectionMenu();
    return;
  }
  const rect = readSelectionClientRect(event);
  if (!rect) {
    hideSelectionMenu();
    return;
  }
  const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 1024;
  const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 768;
  const menuWidth = 112;
  const menuHeight = 38;
  const gap = 10;
  const topCandidate = rect.top - menuHeight - gap;
  const fallbackTop = rect.top + rect.height + gap;
  const top = topCandidate >= 8 ? topCandidate : fallbackTop;
  selectionMenu.value = {
    visible: true,
    left: clampNumber(rect.left + rect.width / 2, menuWidth / 2 + 8, viewportWidth - menuWidth / 2 - 8),
    top: clampNumber(top, 8, viewportHeight - menuHeight - 8)
  };
}

function captureSelection(event?: Event) {
  if (!isTechDesignMarkdown.value || !markdownPreviewRef.value || !showAnnotationControls.value) {
    clearSelectionDraft();
    return;
  }
  const draft = createAnnotationAnchor(markdownPreviewRef.value);
  if (draft) {
    selectionDraft.value = draft;
    showSelectionMenu(event);
    return;
  }
  const target = event?.target;
  if (!target || (target instanceof Node && markdownPreviewRef.value.contains(target))) {
    clearSelectionDraft();
  }
}

async function createAnnotationFromSelection() {
  hideSelectionMenu();
  if (isPublicPreview.value && !props.canCreateAnnotation) {
    emit('login-required');
    return;
  }
  if (!selectionDraft.value) {
    ElMessage.warning('请先选择需要批注的文案');
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
    const input = {
      versionId: selectedVersionId.value || 'current',
      selectedText: selectionDraft.value.selectedText,
      anchor: selectionDraft.value.anchor,
      comment,
      includeInNextGeneration: true,
      expectedHash: annotationHash.value
    };
    const response =
      isPublicPreview.value && props.publicToken
        ? await apiClient.createPublicTechDesignAnnotation(props.publicToken, input)
        : await apiClient.createTechDesignAnnotation(requirementId.value, input);
    techDesignAnnotations.value = response.annotations;
    annotationHash.value = response.hash;
    window.getSelection()?.removeAllRanges();
    clearSelectionDraft();
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

async function updateAnnotation(annotation: TechDesignAnnotation, input: { status?: TechDesignAnnotation['status']; includeInNextGeneration?: boolean }) {
  if (!requirementId.value || isPublicPreview.value) {
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

async function resolveAnnotation(annotation: TechDesignAnnotation) {
  await updateAnnotation(annotation, { status: 'RESOLVED', includeInNextGeneration: false });
}

async function toggleAnnotationInclude(annotation: TechDesignAnnotation, include: boolean) {
  await updateAnnotation(annotation, { includeInNextGeneration: include });
}

async function deleteAnnotation(annotation: TechDesignAnnotation) {
  if (isPublicPreview.value ? !props.publicToken : !requirementId.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('删除后该批注不会再显示，也不会进入下一次技术方案生成。确认删除吗？', '删除技术方案批注', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
    const response = isPublicPreview.value
      ? await apiClient.deletePublicTechDesignAnnotation(props.publicToken, annotation.id)
      : await apiClient.deleteTechDesignAnnotation(requirementId.value, annotation.id, {
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
    if (error.code === 'B70002' || error.status === 403) {
      ElMessage.error('只能删除本人创建的批注');
      return;
    }
    ElMessage.error(error.message || '删除批注失败');
  }
}

async function replyToAnnotation(annotation: TechDesignAnnotation) {
  if (isPublicPreview.value && !props.canCreateAnnotation) {
    emit('login-required');
    return;
  }
  if (isPublicPreview.value ? !props.publicToken : !requirementId.value) {
    return;
  }
  try {
    const result = await ElMessageBox.prompt('回复这条技术方案批注', '回复批注', {
      inputType: 'textarea',
      inputPlaceholder: '请输入回复内容',
      confirmButtonText: '保存',
      cancelButtonText: '取消'
    });
    const content = String(result.value || '').trim();
    if (!content) {
      ElMessage.warning('请输入回复内容');
      return;
    }
    const response = isPublicPreview.value
      ? await apiClient.createPublicTechDesignAnnotationReply(props.publicToken, annotation.id, { content })
      : await apiClient.createTechDesignAnnotationReply(requirementId.value, annotation.id, {
          content,
          expectedHash: annotationHash.value
        });
    techDesignAnnotations.value = response.annotations;
    annotationHash.value = response.hash;
    annotationPanelVisible.value = true;
    await nextTick();
    applyAnnotationMarks();
    ElMessage.success('回复已保存');
  } catch (error: any) {
    if (error === 'cancel' || error?.message === 'cancel') {
      return;
    }
    ElMessage.error(error.message || '保存回复失败');
  }
}

async function deleteAnnotationReply(annotation: TechDesignAnnotation, reply: TechDesignAnnotationReply) {
  if (isPublicPreview.value ? !props.publicToken : !requirementId.value) {
    return;
  }
  try {
    await ElMessageBox.confirm('删除后该回复不会再显示，也不会进入下一次技术方案生成。确认删除吗？', '删除批注回复', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
    const response = isPublicPreview.value
      ? await apiClient.deletePublicTechDesignAnnotationReply(props.publicToken, annotation.id, reply.id)
      : await apiClient.deleteTechDesignAnnotationReply(requirementId.value, annotation.id, reply.id, {
          expectedHash: annotationHash.value
        });
    techDesignAnnotations.value = response.annotations;
    annotationHash.value = response.hash;
    await nextTick();
    applyAnnotationMarks();
    ElMessage.success('回复已删除');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close' || error?.message === 'cancel' || error?.message === 'close') {
      return;
    }
    if (error.code === 'B70002' || error.status === 403) {
      ElMessage.error('只能删除本人创建的回复');
      return;
    }
    ElMessage.error(error.message || '删除回复失败');
  }
}

function locateAnnotation(annotation: TechDesignAnnotation) {
  let target = markdownPreviewRef.value?.querySelector<HTMLElement>(`[data-annotation-id="${annotation.id}"]`);
  if (!target) {
    applyAnnotationMarks();
    target = markdownPreviewRef.value?.querySelector<HTMLElement>(`[data-annotation-id="${annotation.id}"]`);
  }
  if (!target) {
    ElMessage.warning('当前版本未定位到该批注文案');
    return;
  }
  scrollPreviewTarget(target, 'center');
  flashAnnotationHighlight(annotation.id);
}

function annotationHighlightElements(annotationId: string): Element[] {
  return Array.from(markdownPreviewRef.value?.querySelectorAll<Element>('[data-annotation-id]') || []).filter(
    (element) => element.getAttribute('data-annotation-id') === annotationId
  );
}

function clearFlashingAnnotationHighlights() {
  markdownPreviewRef.value
    ?.querySelectorAll('.tech-design-annotation-highlight--flash, .tech-design-annotation-svg-highlight--flash')
    .forEach((element) => element.classList.remove('tech-design-annotation-highlight--flash', 'tech-design-annotation-svg-highlight--flash'));
}

function flashAnnotationHighlight(annotationId: string) {
  const elements = annotationHighlightElements(annotationId);
  if (!elements.length) {
    return;
  }
  if (annotationHighlightFlashTimer) {
    clearTimeout(annotationHighlightFlashTimer);
  }
  clearFlashingAnnotationHighlights();
  elements.forEach((element) => {
    element.classList.add(
      element.classList.contains('tech-design-annotation-svg-highlight')
        ? 'tech-design-annotation-svg-highlight--flash'
        : 'tech-design-annotation-highlight--flash'
    );
  });
  annotationHighlightFlashTimer = setTimeout(() => {
    elements.forEach((element) =>
      element.classList.remove('tech-design-annotation-highlight--flash', 'tech-design-annotation-svg-highlight--flash')
    );
  }, 1400);
}

async function focusAnnotationPanel(annotationId: string) {
  annotationPanelVisible.value = true;
  await nextTick();
  annotationPanelRef.value?.focusAnnotation(annotationId);
}

function focusAnnotationFromHighlight(annotationId: string) {
  const annotation = selectedVersionAnnotations.value.find((item) => item.id === annotationId);
  if (!annotation) {
    return;
  }
  void focusAnnotationPanel(annotation.id);
}

function toggleAnnotationPanel() {
  annotationPanelVisible.value = !annotationPanelVisible.value;
}

function openVersionDiff() {
  if (!requirementId.value) {
    return;
  }
  versionDiffDialog.value?.open(requirementId.value, techDesignVersions.value, selectedVersionId.value);
}

function handleMarkdownPreviewClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const annotationTarget = target?.closest<HTMLElement>('[data-annotation-id]');
  if (annotationTarget && markdownPreviewRef.value?.contains(annotationTarget)) {
    const annotationId = annotationTarget.dataset.annotationId;
    if (annotationId) {
      event.preventDefault();
      event.stopPropagation();
      focusAnnotationFromHighlight(annotationId);
      return;
    }
  }
  const button = target?.closest<HTMLButtonElement>('[data-sequence-zoom-action]');
  if (!button || !markdownPreviewRef.value?.contains(button)) {
    return;
  }
  const diagram = button.closest<HTMLElement>('.mermaid-diagram');
  if (!diagram || diagram.dataset.mermaidType !== 'sequence') {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const currentZoom = readSequenceDiagramZoomPercent(diagram);
  const action = button.dataset.sequenceZoomAction;
  if (action === 'in') {
    setSequenceDiagramZoomPercent(diagram, currentZoom + sequenceDiagramZoomStepPercent);
    return;
  }
  if (action === 'out') {
    setSequenceDiagramZoomPercent(diagram, currentZoom - sequenceDiagramZoomStepPercent);
    return;
  }
  if (action === 'reset') {
    setSequenceDiagramZoomPercent(diagram, sequenceDiagramDefaultZoomPercent);
  }
}

function handleZoomShortcut(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    clearSelectionDraft();
    return;
  }
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

onMounted(() => {
  window.addEventListener('keydown', handleZoomShortcut);
  window.addEventListener('mouseup', captureSelection);
  window.addEventListener(TECH_DESIGN_ANNOTATION_CHANGED_EVENT, handleTechDesignAnnotationChanged);
  void nextTick().then(() => {
    rebuildOutline();
    applyAnnotationMarks();
  });
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleZoomShortcut);
  window.removeEventListener('mouseup', captureSelection);
  window.removeEventListener(TECH_DESIGN_ANNOTATION_CHANGED_EVENT, handleTechDesignAnnotationChanged);
  outlineObserver?.disconnect();
  if (annotationHighlightFlashTimer) {
    clearTimeout(annotationHighlightFlashTimer);
  }
});

async function copyPath() {
  if (!props.artifact?.path) {
    return;
  }
  await navigator.clipboard.writeText(props.artifact.path).catch(() => undefined);
  ElMessage.success('路径已复制');
}

function padNumber(value: number) {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
    padNumber(date.getHours()),
    padNumber(date.getMinutes()),
    padNumber(date.getSeconds())
  ].join('');
}

function sanitizeFilePart(value: string) {
  return (
    value
      .trim()
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/[\\/:*?"<>|#%{}$!`&=+@~，。；：、（）【】《》\s]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'artifact'
  );
}

function artifactBaseName() {
  const label = props.artifact?.label || props.artifact?.path.split('/').pop() || 'artifact';
  return sanitizeFilePart(label);
}

function exportRequirementId() {
  return sanitizeFilePart(requirementId.value || 'requirement');
}

function exportFileName(extensionName: string) {
  return `${exportRequirementId()}_${formatTimestamp()}_${artifactBaseName()}.${extensionName.replace(/^\./, '')}`;
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
  if (!props.artifact?.path) {
    return;
  }
  const format = String(command) as DownloadFormat;
  if (format === 'markdown') {
    downloadBlob(effectiveContent.value || '', exportFileName('md'), 'text/markdown;charset=utf-8');
    ElMessage.success('已下载 Markdown');
    return;
  }
  await nextTick();
  await renderMermaidDiagrams();
  if (format === 'html') {
    const name = exportFileName('html');
    downloadBlob(buildExportHtml(name), name, 'text/html;charset=utf-8');
    ElMessage.success('已下载 HTML');
    return;
  }
  if (format === 'pdf') {
    const name = exportFileName('pdf');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      ElMessage.error('无法打开 PDF 导出窗口，请检查浏览器弹窗设置');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildExportHtml(name));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    ElMessage.success('已打开 PDF 导出窗口');
  }
}

function downloadOriginalArtifact() {
  if (!assetUrl.value) {
    return;
  }
  const link = document.createElement('a');
  link.href = assetUrl.value;
  link.download = exportFileName(extension.value || 'artifact');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function clonePreviewForExport() {
  const clone = markdownPreviewRef.value?.cloneNode(true) as HTMLElement | undefined;
  if (!clone) {
    return '';
  }
  clone.querySelectorAll('.tech-design-annotation-svg-highlight').forEach((node) => node.remove());
  clone.querySelectorAll('.tech-design-annotation-highlight').forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
    parent.normalize();
  });
  return clone.innerHTML;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildExportHtml(name: string) {
  const bodyHtml = clonePreviewForExport() || previewHtml.value;
  const title = escapeHtml(name.replace(/\.[^.]+$/, ''));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      color: #1f2d2a;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.68;
    }
    .artifact-markdown {
      box-sizing: border-box;
      width: 100%;
      max-width: none;
      min-height: 100vh;
      margin: 0;
      padding: 32px;
      background: #ffffff;
    }
    h1, h2, h3, h4 {
      color: #17231f;
      line-height: 1.35;
    }
    code {
      padding: 1px 4px;
      border-radius: 3px;
      background: #eef2f0;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }
    pre {
      overflow: auto;
      padding: 14px;
      border-radius: 6px;
      background: #f6f8fb;
      white-space: pre-wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 8px;
      border: 1px solid #d7dee8;
      vertical-align: top;
    }
    img, svg {
      max-width: 100%;
      height: auto;
    }
    .mermaid-diagram {
      position: relative;
      width: 100%;
      margin: 24px 0 28px;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .mermaid-sequence-diagram {
      padding-top: 42px;
    }
    .mermaid-diagram svg {
      display: block;
    }
    .sequence-diagram-toolbar {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border: 1px solid #d8e0ec;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.1);
    }
    .sequence-diagram-zoom-button,
    .sequence-diagram-reset-button {
      height: 24px;
      min-width: 24px;
      padding: 0 7px;
      color: #334155;
      border: 1px solid #d8e0ec;
      border-radius: 5px;
      background: #ffffff;
      cursor: pointer;
    }
    .sequence-diagram-zoom-button:disabled,
    .sequence-diagram-reset-button:disabled {
      color: #94a3b8;
      cursor: not-allowed;
      background: #f8fafc;
    }
    .sequence-diagram-zoom-percent {
      min-width: 44px;
      color: #334155;
      font-size: 12px;
      text-align: center;
    }
    @media print {
      body {
        background: #ffffff;
      }
      .artifact-markdown {
        padding: 18mm 14mm;
      }
      .mermaid-diagram {
        overflow: visible;
        break-inside: avoid;
      }
      .sequence-diagram-toolbar {
        display: none;
      }
      pre, table {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <article class="artifact-markdown">${bodyHtml}</article>
</body>
</html>`;
}

defineExpose({ downloadMarkdownArtifact, downloadOriginalArtifact });
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
.eye-care-toggle,
.preview-reading-mode {
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
  overflow: hidden;
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

.preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.preview-layout.with-outline {
  grid-template-columns: minmax(48px, 240px) minmax(0, 1fr);
}

.preview-layout.with-outline.outline-collapsed {
  grid-template-columns: 48px minmax(0, 1fr);
}

.preview-layout.with-annotations {
  grid-template-columns: minmax(0, 1fr) clamp(320px, 22vw, 420px);
}

.preview-layout.with-outline.with-annotations {
  grid-template-columns: minmax(48px, 240px) minmax(0, 1fr) clamp(320px, 22vw, 420px);
}

.preview-layout.with-outline.outline-collapsed.with-annotations {
  grid-template-columns: 48px minmax(0, 1fr) clamp(320px, 22vw, 420px);
}

.preview-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.artifact-markdown {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 28px;
  background: #ffffff;
}

.artifact-markdown--classic {
  border-radius: 0;
}

.artifact-markdown--rich {
  width: calc(100% - 48px);
  max-width: 1080px;
  min-height: calc(100% - 48px);
  margin: 24px auto;
  padding: clamp(32px, 4vw, 56px);
  color: #24324a;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  font-size: 15px;
  line-height: 1.78;
}

.artifact-markdown--rich :deep(h1),
.artifact-markdown--rich :deep(h2),
.artifact-markdown--rich :deep(h3),
.artifact-markdown--rich :deep(h4),
.artifact-markdown--rich :deep(h5),
.artifact-markdown--rich :deep(h6) {
  color: #172033;
  font-weight: 700;
  line-height: 1.36;
  scroll-margin-top: 24px;
}

.artifact-markdown--rich :deep(h1) {
  margin: 0 0 32px;
  padding-bottom: 18px;
  border-bottom: 2px solid #dbe5f3;
  font-size: clamp(28px, 3vw, 38px);
  letter-spacing: -0.025em;
}

.artifact-markdown--rich :deep(h2) {
  margin: 44px 0 18px;
  padding-left: 12px;
  border-left: 4px solid #3b82f6;
  font-size: 24px;
}

.artifact-markdown--rich :deep(h3) {
  margin: 32px 0 14px;
  font-size: 19px;
}

.artifact-markdown--rich :deep(h4),
.artifact-markdown--rich :deep(h5),
.artifact-markdown--rich :deep(h6) {
  margin: 24px 0 10px;
  font-size: 16px;
}

.artifact-markdown--rich :deep(p),
.artifact-markdown--rich :deep(ul),
.artifact-markdown--rich :deep(ol) {
  margin: 0 0 16px;
}

.artifact-markdown--rich :deep(li + li) {
  margin-top: 6px;
}

.artifact-markdown--rich :deep(a) {
  color: #2563eb;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.artifact-markdown--rich :deep(blockquote) {
  margin: 24px 0;
  padding: 14px 18px;
  color: #44546a;
  border-left: 4px solid #93c5fd;
  border-radius: 0 8px 8px 0;
  background: #eff6ff;
}

.artifact-markdown--rich :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.artifact-markdown--rich :deep(code) {
  padding: 2px 6px;
  color: #be185d;
  border-radius: 5px;
  background: #f1f5f9;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.9em;
}

.artifact-markdown--rich :deep(pre) {
  margin: 22px 0;
  padding: 18px 20px;
  overflow: auto;
  color: #dbeafe;
  border: 1px solid #1e293b;
  border-radius: 10px;
  background: #0f172a;
  line-height: 1.65;
}

.artifact-markdown--rich :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.artifact-markdown--rich :deep(table) {
  display: block;
  width: 100%;
  margin: 24px 0;
  overflow-x: auto;
  border-spacing: 0;
  border-collapse: collapse;
}

.artifact-markdown--rich :deep(th),
.artifact-markdown--rich :deep(td) {
  min-width: 120px;
  padding: 11px 14px;
  border: 1px solid #dbe3ef;
  text-align: left;
  vertical-align: top;
}

.artifact-markdown--rich :deep(th) {
  color: #1e293b;
  background: #f1f5f9;
  font-weight: 700;
}

.artifact-markdown--rich :deep(tr:nth-child(even) td) {
  background: #f8fafc;
}

.artifact-markdown--rich :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 24px auto;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
}

.artifact-markdown :deep(.mermaid-diagram) {
  position: relative;
  width: 100%;
  margin: 24px 0 28px;
  padding: 8px 0 14px;
  overflow-x: auto;
  overflow-y: hidden;
}

.artifact-markdown :deep(.mermaid-sequence-diagram) {
  padding-top: 46px;
}

.artifact-markdown :deep(.mermaid-diagram svg) {
  display: block;
  max-width: 100%;
  height: auto;
}

.artifact-markdown :deep(.sequence-diagram-toolbar) {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.1);
}

.artifact-preview-shell.eye-care .artifact-markdown :deep(.sequence-diagram-toolbar) {
  border-color: #d6c8a7;
  background: rgba(255, 250, 234, 0.96);
}

.artifact-markdown :deep(.sequence-diagram-zoom-button),
.artifact-markdown :deep(.sequence-diagram-reset-button) {
  height: 24px;
  min-width: 24px;
  padding: 0 7px;
  color: #334155;
  border: 1px solid #d8e0ec;
  border-radius: 5px;
  background: #ffffff;
  font-size: 12px;
  line-height: 22px;
  cursor: pointer;
}

.artifact-markdown :deep(.sequence-diagram-zoom-button:disabled),
.artifact-markdown :deep(.sequence-diagram-reset-button:disabled) {
  color: #94a3b8;
  cursor: not-allowed;
  background: #f8fafc;
}

.artifact-markdown :deep(.sequence-diagram-zoom-percent) {
  min-width: 44px;
  color: #334155;
  font-size: 12px;
  text-align: center;
}

.artifact-markdown :deep(.mermaid-render-error) {
  padding: 16px;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
}

.artifact-markdown :deep(.mermaid-error-title) {
  margin-bottom: 10px;
  font-weight: 700;
}

.artifact-markdown :deep(.mermaid-render-error pre) {
  margin: 0;
  color: #7f1d1d;
  border-color: #fecaca;
  background: #fff7f7;
  white-space: pre-wrap;
}

.artifact-markdown :deep(.markdown-render-fallback) {
  min-height: 240px;
  margin: 0;
  color: #334155;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  white-space: pre-wrap;
}

.artifact-markdown :deep(.tech-design-annotation-highlight) {
  padding: 1px 2px;
  border-radius: 3px;
  background: #fef08a;
  box-shadow: inset 0 -1px 0 #f59e0b;
}

.artifact-markdown :deep(.tech-design-annotation-highlight--flash) {
  background: #bfdbfe;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.22), inset 0 -1px 0 #2563eb;
}

.artifact-markdown :deep(.tech-design-annotation-svg-highlight--flash) {
  stroke: #2563eb;
  stroke-width: 2;
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

.selection-annotation-menu {
  position: fixed;
  z-index: 2200;
  transform: translateX(-50%);
  filter: drop-shadow(0 8px 18px rgba(15, 23, 42, 0.18));
}

.selection-annotation-menu__button {
  height: 34px;
  padding: 0 14px;
  color: #ffffff;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  font-size: 13px;
  font-weight: 600;
  line-height: 34px;
  white-space: nowrap;
  cursor: pointer;
}

.selection-annotation-menu__button:hover {
  background: #1d4ed8;
}

.selection-annotation-menu__button:active {
  background: #1e40af;
}

@media print {
  .artifact-markdown :deep(.sequence-diagram-toolbar) {
    display: none;
  }
}

@media (max-width: 760px) {
  .preview-toolbar {
    flex-direction: column;
  }

  .preview-actions {
    justify-content: flex-start;
  }

  .preview-layout.with-outline,
  .preview-layout.with-annotations,
  .preview-layout.with-outline.with-annotations {
    grid-template-columns: 1fr;
  }

  .artifact-markdown--rich {
    width: 100%;
    min-height: 100%;
    margin: 0;
    padding: 24px 18px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
