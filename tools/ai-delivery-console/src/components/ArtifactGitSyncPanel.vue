<template>
  <section class="artifact-sync-panel">
    <el-empty v-if="!plan" description="尚未生成同步计划" />
    <template v-else>
      <div class="sync-layout">
        <aside class="sync-file-pane">
          <div class="sync-file-pane-header">
            <el-radio-group v-model="fileListViewMode" size="small">
              <el-radio-button value="flat">平铺</el-radio-button>
              <el-radio-button value="tree">目录</el-radio-button>
            </el-radio-group>
            <el-checkbox :model-value="allFilesSelected" :indeterminate="someFilesSelected" @change="(value) => setAllFiles(value === true)">
              全选
            </el-checkbox>
          </div>

          <template v-if="syncFiles.length">
            <template v-if="fileListViewMode === 'flat'">
              <div
                v-for="file in syncFiles"
                :key="`${file.status}-${file.path}`"
                class="sync-file-row"
                :class="{ active: selectedFilePath === file.path, unselected: !isFileSelected(file.path) }"
              >
                <el-checkbox :model-value="isFileSelected(file.path)" @change="(value) => toggleFile(file.path, value === true)" />
                <button class="sync-file-button" type="button" @click="selectedFilePath = file.path">
                  <span class="sync-file-status">{{ file.status }}</span>
                  <span class="sync-file-path" :class="filePathToneClass(file)" :title="file.path">{{ file.path }}</span>
                </button>
              </div>
            </template>

            <template v-else>
              <div class="sync-tree-scroll">
                <div v-for="row in treeRows" :key="row.key" class="sync-tree-row">
                  <button
                    v-if="row.type === 'directory'"
                    class="sync-tree-directory-row"
                    type="button"
                    @click="toggleDirectory(row.path)"
                  >
                    <span class="sync-tree-indent" :style="treeIndentStyle(row.depth)" />
                    <span class="sync-tree-toggle">{{ row.expanded ? '-' : '+' }}</span>
                    <span class="sync-tree-directory-content">
                      <strong>{{ row.name }}</strong>
                      <span>{{ row.path }} · {{ row.changedCount }} 个文件</span>
                    </span>
                  </button>
                  <div
                    v-else-if="row.file"
                    class="sync-tree-file-row"
                    :class="{ active: selectedFilePath === row.file.path, unselected: !isFileSelected(row.file.path) }"
                  >
                    <span class="sync-tree-indent" :style="treeIndentStyle(row.depth)" />
                    <el-checkbox :model-value="isFileSelected(row.file.path)" @change="(value) => toggleFile(row.file?.path || '', value === true)" />
                    <button class="sync-tree-file-button" type="button" @click="selectedFilePath = row.file?.path || ''">
                      <span class="sync-file-status">{{ row.file.status }}</span>
                      <span class="sync-file-path" :class="filePathToneClass(row.file)" :title="row.file.path">{{ row.name }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </template>
          <el-empty v-else :description="emptyDescription" />
        </aside>

        <section class="sync-diff-pane" :class="{ fullscreen: isDiffFullscreen }">
          <div class="sync-diff-toolbar">
            <div class="sync-diff-title">
              <strong>{{ diffTitle }}</strong>
              <p class="muted">{{ diffHint }}</p>
            </div>
            <div class="sync-diff-actions">
              <el-radio-group v-model="diffViewMode" size="small">
                <el-radio-button value="line-by-line">统一视图</el-radio-button>
                <el-radio-button value="side-by-side">左右对比</el-radio-button>
              </el-radio-group>
              <el-button
                :icon="isDiffFullscreen ? Minus : FullScreen"
                size="small"
                circle
                :title="isDiffFullscreen ? '退出全屏' : '全屏预览'"
                @click="toggleDiffFullscreen"
              />
            </div>
          </div>
          <div v-if="currentDiffHtml" class="sync-diff-html" v-html="currentDiffHtml"></div>
          <el-empty v-else description="当前选择暂无可视化 diff" />
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { FullScreen, Minus } from '@element-plus/icons-vue';
import { html as diffToHtml } from 'diff2html/bundles/js/diff2html.min.js';
import 'diff2html/bundles/css/diff2html.min.css';
import type { ArtifactGitSyncPlan, ArtifactGitSyncPlanFile } from '@/api/client';
import { buildFileTree, extractFileDiff, extractFilesDiff, filePathToneClass, flattenTreeRows, type GitTreeRow } from '@/utils/git-file-tree';

const props = withDefaults(
  defineProps<{
    plan?: ArtifactGitSyncPlan;
    selectedFiles: string[];
    diffHint?: string;
    emptyDescription?: string;
  }>(),
  {
    diffHint: '仅预览并同步当前勾选的受控产物文件。',
    emptyDescription: '暂无可同步文件'
  }
);

const emit = defineEmits<{
  (event: 'update:selectedFiles', value: string[]): void;
}>();

const selectedFilePath = ref('');
const fileListViewMode = ref<'flat' | 'tree'>('flat');
const diffViewMode = ref<'line-by-line' | 'side-by-side'>('side-by-side');
const isDiffFullscreen = ref(false);
const collapsedDirectoryPaths = ref<string[]>([]);

const syncFiles = computed(() => props.plan?.files || []);
const syncFilePaths = computed(() => syncFiles.value.map((file) => file.path));
const selectedFilePaths = computed(() => props.selectedFiles.filter((filePath) => syncFilePaths.value.includes(filePath)));
const selectedFilePathSet = computed(() => new Set(selectedFilePaths.value));
const selectedFileCount = computed(() => selectedFilePaths.value.length);
const allFilesSelected = computed(() => Boolean(syncFiles.value.length && selectedFileCount.value === syncFiles.value.length));
const someFilesSelected = computed(() => selectedFileCount.value > 0 && !allFilesSelected.value);

const treeRows = computed<GitTreeRow<ArtifactGitSyncPlanFile>[]>(() => {
  const tree = buildFileTree(syncFiles.value, []);
  return flattenTreeRows(tree, collapsedDirectoryPaths.value);
});

const currentDiff = computed(() => {
  const diff = props.plan?.diff || '';
  if (!diff.trim() || !selectedFilePaths.value.length) {
    return '';
  }
  if (selectedFilePath.value) {
    return selectedFilePathSet.value.has(selectedFilePath.value) ? extractFileDiff(diff, selectedFilePath.value) : '';
  }
  if (selectedFilePaths.value.length === syncFiles.value.length) {
    return diff;
  }
  return extractFilesDiff(diff, selectedFilePaths.value);
});

const currentDiffHtml = computed(() => {
  if (!currentDiff.value.trim()) {
    return '';
  }
  return diffToHtml(currentDiff.value, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: diffViewMode.value
  });
});

const diffTitle = computed(() => {
  if (selectedFilePath.value) {
    return selectedFilePath.value;
  }
  return selectedFileCount.value ? `已选 ${selectedFileCount.value} 个文件` : '未选择文件';
});

function setSelectedFiles(files: string[]) {
  emit('update:selectedFiles', [...new Set(files)].filter((filePath) => syncFilePaths.value.includes(filePath)));
}

function isFileSelected(filePath: string): boolean {
  return selectedFilePathSet.value.has(filePath);
}

function toggleFile(filePath: string, selected: boolean) {
  if (!filePath) {
    return;
  }
  setSelectedFiles(selected ? [...selectedFilePaths.value, filePath] : selectedFilePaths.value.filter((item) => item !== filePath));
}

function setAllFiles(selected: boolean) {
  setSelectedFiles(selected ? syncFilePaths.value : []);
}

function toggleDirectory(directoryPath: string) {
  const collapsed = new Set(collapsedDirectoryPaths.value);
  if (collapsed.has(directoryPath)) {
    collapsed.delete(directoryPath);
  } else {
    collapsed.add(directoryPath);
  }
  collapsedDirectoryPaths.value = [...collapsed];
}

function treeIndentStyle(depth: number) {
  return {
    width: `${Math.max(depth, 0) * 14}px`
  };
}

function toggleDiffFullscreen() {
  isDiffFullscreen.value = !isDiffFullscreen.value;
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && isDiffFullscreen.value) {
    isDiffFullscreen.value = false;
  }
}

watch(
  () => props.plan,
  () => {
    selectedFilePath.value = '';
    collapsedDirectoryPaths.value = [];
    isDiffFullscreen.value = false;
  }
);

watch(syncFilePaths, () => {
  if (selectedFilePath.value && !syncFilePaths.value.includes(selectedFilePath.value)) {
    selectedFilePath.value = '';
  }
  if (props.selectedFiles.some((filePath) => !syncFilePaths.value.includes(filePath))) {
    setSelectedFiles(props.selectedFiles);
  }
});

watch(selectedFilePathSet, () => {
  if (selectedFilePath.value && !selectedFilePathSet.value.has(selectedFilePath.value)) {
    selectedFilePath.value = '';
  }
});

onMounted(() => {
  window.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscape);
});
</script>

<style scoped>
.artifact-sync-panel {
  min-height: 480px;
}

.sync-layout {
  display: grid;
  grid-template-columns: minmax(280px, 36%) minmax(0, 1fr);
  min-height: 500px;
  overflow: hidden;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #ffffff;
}

.sync-file-pane {
  overflow: auto;
  border-right: 1px solid #e5eaf3;
  background: #f8fafc;
}

.sync-file-pane-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #edf1f7;
  background: #f8fafc;
}

.sync-file-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid #edf1f7;
}

.sync-file-row.active,
.sync-tree-file-row.active {
  background: #eef5ff;
}

.sync-file-row.unselected,
.sync-tree-file-row.unselected {
  opacity: 0.62;
}

.sync-file-button,
.sync-tree-file-button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  color: #1f2a44;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sync-tree-scroll {
  width: 100%;
  min-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.sync-tree-row {
  min-width: 100%;
}

.sync-tree-directory-row,
.sync-tree-file-row {
  display: flex;
  align-items: center;
  width: max-content;
  min-width: 100%;
  color: #334155;
  border: 0;
  background: transparent;
  white-space: nowrap;
}

.sync-tree-directory-row {
  gap: 4px;
  padding: 5px 10px;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
}

.sync-tree-directory-row:hover,
.sync-tree-file-row:hover {
  background: #e7edf5;
}

.sync-tree-file-row {
  gap: 8px;
  padding: 0 10px;
}

.sync-tree-file-button {
  width: max-content;
  min-width: 240px;
  padding: 6px 0;
}

.sync-tree-indent {
  flex: 0 0 auto;
  height: 1px;
}

.sync-tree-toggle {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  color: #60708f;
  font-size: 12px;
  line-height: 1;
}

.sync-tree-directory-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: max-content;
}

.sync-tree-directory-content span {
  color: #60708f;
}

.sync-file-status {
  min-width: 30px;
  padding: 1px 6px;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #eff6ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  text-align: center;
}

.sync-file-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-file-path-modified {
  color: #2563eb;
  font-weight: 600;
}

.git-file-path-added {
  color: #0f9f6e;
  font-weight: 600;
}

.git-file-path-pending {
  color: #dc2626;
  font-weight: 600;
}

.sync-diff-pane {
  min-width: 0;
  overflow: auto;
  background: #ffffff;
}

.sync-diff-pane.fullscreen {
  position: fixed;
  inset: 24px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  box-shadow: 0 24px 70px rgb(15 23 42 / 24%);
}

.sync-diff-toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-bottom: 1px solid #e5eaf3;
  background: #ffffff;
}

.sync-diff-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sync-diff-title strong,
.sync-diff-title p {
  margin: 0;
}

.sync-diff-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.sync-diff-html {
  padding: 12px;
}

.sync-diff-pane.fullscreen .sync-diff-html {
  flex: 1;
  overflow: auto;
}

.sync-diff-html :deep(.d2h-file-header) {
  border-radius: 8px 8px 0 0;
}

.sync-diff-html :deep(.d2h-file-wrapper) {
  border-color: #e5eaf3;
  border-radius: 8px;
}

@media (max-width: 960px) {
  .sync-layout {
    grid-template-columns: 1fr;
  }

  .sync-file-pane {
    max-height: 320px;
    border-right: 0;
    border-bottom: 1px solid #e5eaf3;
  }

  .sync-diff-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .sync-diff-actions {
    justify-content: flex-start;
  }
}
</style>
