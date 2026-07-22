<template>
  <section class="git-inspector">
    <template v-if="summaryView">
      <div class="git-overview">
        <div>
          <strong>工程变更概览</strong>
          <p class="muted">
            {{ summaryView.projects.length }} 个工程 · {{ summaryView.files.length }} 个正式变更 ·
            {{ summaryView.untrackedFiles.length }} 个待确认新文件 · {{ summaryView.updatedAt }}
          </p>
        </div>
        <div class="git-metrics">
          <span>{{ summaryView.files.length }} 正式变更</span>
          <span v-if="summaryView.untrackedFiles.length" class="pending-files">{{ summaryView.untrackedFiles.length }} 待确认</span>
          <span class="additions">+{{ summaryView.additions }}</span>
          <span class="deletions">-{{ summaryView.deletions }}</span>
        </div>
      </div>

      <el-tabs v-model="activeProjectPath" class="git-project-tabs">
        <el-tab-pane v-for="project in summaryView.projects" :key="project.project.path" :name="project.project.path">
          <template #label>
            <span class="project-tab-label">
              {{ project.project.name }}
              <el-tag size="small" effect="plain">{{ project.files.length }}</el-tag>
              <el-tag v-if="project.untrackedFiles.length" size="small" type="warning" effect="plain">
                待确认 {{ project.untrackedFiles.length }}
              </el-tag>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <el-alert
        v-if="activeProject?.error"
        type="error"
        show-icon
        :title="activeProject.error"
        class="git-project-alert"
      />
      <el-alert
        v-else-if="activeProject && !activeProject.branchMatches"
        type="warning"
        show-icon
        :title="`当前分支 ${activeProject.currentBranch || '-'} 与期望分支 ${activeProject.expectedBranch || '-'} 不一致`"
        class="git-project-alert"
      />
      <el-alert
        v-if="activeProject?.untrackedFiles.length"
        type="warning"
        show-icon
        title="存在待确认新文件，未 git add 前不会进入正式 diff 和代码评审统计"
        class="git-project-alert"
      />

      <div v-if="activeProject" class="git-project-summary">
        <span>{{ activeProject.project.path }}</span>
        <span>当前分支：{{ activeProject.currentBranch || '-' }}</span>
        <span>期望分支：{{ activeProject.expectedBranch || '-' }}</span>
        <span v-if="activeProject.untrackedFiles.length" class="pending-files">
          待确认新文件：{{ activeProject.untrackedFiles.length }}
        </span>
        <span class="additions">+{{ activeProject.additions }}</span>
        <span class="deletions">-{{ activeProject.deletions }}</span>
      </div>

      <div v-if="hasActiveProjectChanges" class="git-review-layout">
        <aside class="git-file-pane">
          <div class="git-file-pane-header">
            <el-radio-group v-model="fileListViewMode" size="small">
              <el-radio-button value="flat">平铺</el-radio-button>
              <el-radio-button value="tree">目录</el-radio-button>
            </el-radio-group>
            <div v-if="activeProject?.untrackedFiles.length" class="git-untracked-actions">
              <el-checkbox
                :model-value="allUntrackedSelected"
                :indeterminate="someUntrackedSelected"
                @change="(value) => setAllUntrackedFiles(value === true)"
              >
                全选
              </el-checkbox>
              <el-button
                class="stage-untracked-button"
                size="small"
                type="primary"
                :icon="DocumentChecked"
                :loading="isStagingUntracked"
                :disabled="!canStageUntracked"
                @click="stageSelectedUntrackedFiles"
              >
                加入暂存区
              </el-button>
            </div>
          </div>

          <button
            v-if="activeProject?.files.length"
            class="git-file-row"
            :class="{ active: selectedFilePath === '' }"
            type="button"
            @click="selectedFilePath = ''"
          >
            <span class="git-file-status all">ALL</span>
            <span class="git-file-path">全部变更</span>
            <span class="git-file-stat">+{{ activeProject.additions }} -{{ activeProject.deletions }}</span>
          </button>

          <template v-if="fileListViewMode === 'flat'">
            <button
              v-for="file in activeProject?.files || []"
              :key="`${file.status}-${file.path}`"
              class="git-file-row"
              :class="{ active: selectedFilePath === file.path }"
              type="button"
              @click="selectedFilePath = file.path"
            >
              <span class="git-file-status">{{ file.status }}</span>
              <span class="git-file-path" :class="filePathToneClass(file)">{{ file.path }}</span>
              <span class="git-file-flags">
                <el-tag v-if="file.staged" size="small" effect="plain">staged</el-tag>
                <el-tag v-if="file.unstaged" size="small" effect="plain">unstaged</el-tag>
              </span>
              <span class="git-file-stat">+{{ file.additions || 0 }} -{{ file.deletions || 0 }}</span>
            </button>
            <div v-if="activeProject?.untrackedFiles.length" class="git-untracked-section">
              <div class="git-untracked-title">
                <strong>待确认新文件</strong>
                <el-tag size="small" type="warning" effect="plain">{{ activeProject.untrackedFiles.length }}</el-tag>
              </div>
              <p class="muted">这些文件尚未 git add，不计入正式 diff。确认属于本需求后先加入暂存区再刷新。</p>
              <div
                v-for="file in activeProject.untrackedFiles"
                :key="file.path"
                class="git-untracked-row"
                :class="{ selected: isUntrackedSelected(file.path) }"
              >
                <el-checkbox :model-value="isUntrackedSelected(file.path)" @change="(value) => toggleUntrackedFile(file.path, value === true)" />
                <span class="git-file-status pending">??</span>
                <span class="git-file-path" :class="filePathToneClass(file)">{{ file.path }}</span>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="git-tree-scroll">
              <div v-if="changedTreeRows.length" class="git-tree-section git-tree-changed-section">
                <div class="git-tree-section-title">
                  <strong>正式变更</strong>
                  <span>{{ activeProject.files.length }} 个 · +{{ activeProject.additions }} -{{ activeProject.deletions }}</span>
                </div>
                <div v-for="row in changedTreeRows" :key="row.key" class="git-tree-row">
                  <button
                    v-if="row.type === 'directory'"
                    class="git-tree-directory-row"
                    type="button"
                    @click="toggleTreeDirectory('changed', row.path)"
                  >
                    <span class="git-tree-indent" :style="treeIndentStyle(row.depth)" />
                    <span class="git-tree-toggle">{{ row.expanded ? '-' : '+' }}</span>
                    <span class="git-tree-directory-content">
                      <strong>{{ row.name }}</strong>
                      <span>{{ row.path }} · {{ row.changedCount }} 变更 · +{{ row.additions }} -{{ row.deletions }}</span>
                    </span>
                  </button>
                  <button
                    v-else-if="row.file"
                    class="git-file-row git-tree-file-row"
                    :class="{ active: selectedFilePath === row.file.path }"
                    type="button"
                    @click="selectedFilePath = row.file.path"
                  >
                    <span class="git-tree-indent" :style="treeIndentStyle(row.depth)" />
                    <span class="git-file-status">{{ row.file.status }}</span>
                    <span class="git-file-path" :class="filePathToneClass(row.file)" :title="row.file.path">{{ row.name }}</span>
                    <span class="git-file-flags">
                      <el-tag v-if="row.file.staged" size="small" effect="plain">staged</el-tag>
                      <el-tag v-if="row.file.unstaged" size="small" effect="plain">unstaged</el-tag>
                    </span>
                    <span class="git-file-stat">+{{ row.file.additions || 0 }} -{{ row.file.deletions || 0 }}</span>
                  </button>
                </div>
              </div>

              <div v-if="untrackedTreeRows.length" class="git-tree-section git-tree-pending-section">
                <div class="git-tree-section-title">
                  <strong>待确认新文件</strong>
                  <span>{{ activeProject.untrackedFiles.length }} 个</span>
                </div>
                <div v-for="row in untrackedTreeRows" :key="row.key" class="git-tree-row">
                  <button
                    v-if="row.type === 'directory'"
                    class="git-tree-directory-row"
                    type="button"
                    @click="toggleTreeDirectory('untracked', row.path)"
                  >
                    <span class="git-tree-indent" :style="treeIndentStyle(row.depth)" />
                    <span class="git-tree-toggle">{{ row.expanded ? '-' : '+' }}</span>
                    <span class="git-tree-directory-content">
                      <strong>{{ row.name }}</strong>
                      <span>{{ row.path }} · {{ row.untrackedCount }} 待确认</span>
                    </span>
                  </button>
                  <div
                    v-else-if="row.file"
                    class="git-untracked-row git-tree-untracked-row"
                    :class="{ selected: isUntrackedSelected(row.file.path) }"
                  >
                    <span class="git-tree-indent" :style="treeIndentStyle(row.depth)" />
                    <el-checkbox :model-value="isUntrackedSelected(row.file.path)" @change="(value) => toggleUntrackedFile(row.file?.path || '', value === true)" />
                    <span class="git-file-status pending">??</span>
                    <span class="git-file-path" :class="filePathToneClass(row.file)" :title="row.file.path">{{ row.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </aside>

        <section class="git-diff-pane" :class="{ fullscreen: isDiffFullscreen }">
          <div class="git-diff-toolbar">
            <div class="git-diff-title">
              <strong>{{ selectedFilePath || '全部变更' }}</strong>
              <p class="muted">{{ activeProject.project.name }} · diff2html</p>
            </div>
            <div class="git-diff-actions">
              <span v-if="renderedDiffFiles.length" class="git-diff-total">
                {{ renderedDiffFiles.length }} 个文件 · <span class="additions">+{{ currentDiffAdditions }}</span>
                <span class="deletions">-{{ currentDiffDeletions }}</span>
              </span>
              <select v-model.number="diffContextLines" class="git-context-select" :disabled="isLoadingExpandedDiff" @change="loadDiffContext">
                <option :value="3">默认上下文</option>
                <option :value="30">更多上下文</option>
                <option :value="100">大量上下文</option>
                <option :value="200">完整上下文</option>
              </select>
              <el-button class="git-diff-expand-all-button" size="small" :disabled="!renderedDiffFiles.length" @click="expandAllDiffFiles">展开全部</el-button>
              <el-button class="git-diff-collapse-all-button" size="small" :disabled="!renderedDiffFiles.length" @click="collapseAllDiffFiles">收起全部</el-button>
              <el-radio-group v-model="diffViewMode" size="small">
                <el-radio-button value="line-by-line">统一视图</el-radio-button>
                <el-radio-button value="side-by-side">左右对比</el-radio-button>
              </el-radio-group>
              <el-button
                class="git-diff-fullscreen-button"
                :icon="isDiffFullscreen ? Minus : FullScreen"
                size="small"
                circle
                :title="isDiffFullscreen ? '退出全屏' : '全屏预览'"
                @click="toggleDiffFullscreen"
              />
            </div>
          </div>
          <el-alert
            v-if="expandedDiffPreview?.truncated"
            class="git-diff-context-alert"
            type="warning"
            show-icon
            title="扩展上下文后的 diff 内容过长，已截断展示"
          />
          <div v-if="renderedDiffFiles.length" class="git-diff-html">
            <article v-for="item in renderedDiffFiles" :key="item.file.path" class="git-diff-file-card" :class="{ collapsed: isDiffFileCollapsed(item.file.path) }">
              <header class="git-diff-file-header">
                <button class="git-diff-file-toggle" type="button" :title="isDiffFileCollapsed(item.file.path) ? '展开文件 diff' : '收起文件 diff'" @click="toggleDiffFile(item.file.path)">
                  {{ isDiffFileCollapsed(item.file.path) ? '+' : '-' }}
                </button>
                <span class="git-diff-file-heat" :title="`变更规模 ${item.changeSize} 行`">
                  <span :style="{ width: `${item.heatPercent}%` }" />
                </span>
                <div class="git-diff-file-meta">
                  <strong :title="item.file.path">{{ item.file.path }}</strong>
                  <p>
                    <span class="git-file-status">{{ item.file.status }}</span>
                    <span class="additions">+{{ item.file.additions || 0 }}</span>
                    <span class="deletions">-{{ item.file.deletions || 0 }}</span>
                  </p>
                </div>
                <el-dropdown trigger="click" @command="(command) => handleDiffFileCommand(String(command), item)">
                  <el-button class="git-diff-file-menu" size="small" circle title="文件操作">...</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="view">查看文件</el-dropdown-item>
                      <el-dropdown-item command="copy">复制文件路径</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </header>
              <div v-show="!isDiffFileCollapsed(item.file.path)" class="git-diff-file-body" v-html="item.html"></div>
            </article>
          </div>
          <el-empty v-else description="当前选择暂无可视化 diff" />
        </section>
      </div>

      <el-empty v-else description="暂无已纳入变更或待确认新文件" />
    </template>
    <el-empty v-else description="尚未读取 Git 变更" />
    <el-dialog v-model="filePreviewVisible" class="git-file-preview-dialog" width="82%" destroy-on-close>
      <template #header>
        <div class="git-file-preview-title">
          <strong>{{ filePreview?.filePath || filePreviewTarget?.file.path || '查看文件' }}</strong>
          <p v-if="filePreview">
            {{ filePreview.projectPath }} · {{ filePreview.language }} · {{ formatFileSize(filePreview.size) }}
            <span v-if="filePreview.updatedAt"> · {{ filePreview.updatedAt }}</span>
          </p>
        </div>
      </template>
      <div v-loading="filePreviewLoading" class="git-file-preview-body">
        <el-alert v-if="filePreviewError" type="error" show-icon :title="filePreviewError" />
        <el-empty v-else-if="filePreview && !filePreview.previewable" :description="filePreview.reason || '文件当前不可预览'" />
        <ol v-else-if="filePreview?.content" ref="filePreviewContentRef" class="git-file-preview-code">
          <li
            v-for="line in filePreviewLines"
            :key="line.number"
            class="git-file-preview-line"
            :class="{ focus: line.number === filePreview.focusLine }"
            :data-line="line.number"
          >
            <span>{{ line.text || ' ' }}</span>
          </li>
        </ol>
        <el-empty v-else-if="!filePreviewLoading" description="暂无文件内容" />
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { DocumentChecked, FullScreen, Minus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { html as diffToHtml } from 'diff2html/bundles/js/diff2html.min.js';
import 'diff2html/bundles/css/diff2html.min.css';
import { apiClient } from '@/api/client';
import type { GitChangedFile, GitChangeSummary, GitDiffPreview, GitFilePreview, GitProjectChangeSummary } from '@shared/workflow';
import { buildFileTree, extractFileDiffSections, filePathToneClass, findFirstChangedNewLine, flattenTreeRows, type GitTreeRow } from '@/utils/git-file-tree';

const props = defineProps<{
  summary?: GitChangeSummary;
  requirementId?: string;
}>();

const emit = defineEmits<{
  (event: 'updated', value: GitChangeSummary): void;
}>();

const activeProjectPath = ref('');
const selectedFilePath = ref('');
const diffViewMode = ref<'line-by-line' | 'side-by-side'>('side-by-side');
const fileListViewMode = ref<'flat' | 'tree'>('flat');
const selectedUntrackedFilePaths = ref<string[]>([]);
const isStagingUntracked = ref(false);
const isDiffFullscreen = ref(false);
const diffContextLines = ref(3);
const isLoadingExpandedDiff = ref(false);
const expandedDiffPreview = ref<GitDiffPreview>();
const collapsedDiffFilePaths = ref<string[]>([]);
const filePreviewVisible = ref(false);
const filePreviewLoading = ref(false);
const filePreviewError = ref('');
const filePreview = ref<GitFilePreview>();
const filePreviewTarget = ref<RenderedDiffFile>();
const filePreviewContentRef = ref<HTMLElement>();
const collapsedChangedTreeDirectoryPaths = ref<string[]>([]);
const collapsedUntrackedTreeDirectoryPaths = ref<string[]>([]);

interface FileGroups {
  files: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
}

interface RenderedDiffFile {
  file: GitChangedFile;
  diff: string;
  html: string;
  firstChangedLine?: number;
  changeSize: number;
  heatPercent: number;
}

function normalizeFileGroups(files: GitChangedFile[] = [], untrackedFiles?: GitChangedFile[]): FileGroups {
  if (Array.isArray(untrackedFiles)) {
    return {
      files,
      untrackedFiles
    };
  }
  return {
    files: files.filter((file) => file.status !== '??'),
    untrackedFiles: files.filter((file) => file.status === '??')
  };
}

const summaryView = computed<GitChangeSummary | undefined>(() => {
  if (!props.summary) {
    return undefined;
  }
  const projects = (props.summary.projects || []).map((project) => {
    const groups = normalizeFileGroups(project.files || [], project.untrackedFiles);
    return {
      ...project,
      files: groups.files,
      untrackedFiles: groups.untrackedFiles
    };
  });
  const groups = normalizeFileGroups(props.summary.files || [], props.summary.untrackedFiles);
  return {
    ...props.summary,
    files: groups.files,
    untrackedFiles: groups.untrackedFiles,
    projects
  };
});

const activeProject = computed<GitProjectChangeSummary | undefined>(() =>
  summaryView.value?.projects.find((project) => project.project.path === activeProjectPath.value)
);

const hasActiveProjectChanges = computed(() => Boolean(activeProject.value?.files.length || activeProject.value?.untrackedFiles.length));

const allUntrackedFilePaths = computed(() => activeProject.value?.untrackedFiles.map((file) => file.path) || []);

const selectedUntrackedCount = computed(() => allUntrackedFilePaths.value.filter((filePath) => selectedUntrackedFilePaths.value.includes(filePath)).length);

const allUntrackedSelected = computed(() => Boolean(allUntrackedFilePaths.value.length && selectedUntrackedCount.value === allUntrackedFilePaths.value.length));

const someUntrackedSelected = computed(() => selectedUntrackedCount.value > 0 && !allUntrackedSelected.value);

const canStageUntracked = computed(() => Boolean(props.requirementId && selectedUntrackedCount.value && !isStagingUntracked.value));

const changedTreeRows = computed<GitTreeRow<GitChangedFile>[]>(() => {
  const tree = buildFileTree(activeProject.value?.files || [], []);
  return flattenTreeRows(tree, collapsedChangedTreeDirectoryPaths.value);
});

const untrackedTreeRows = computed<GitTreeRow<GitChangedFile>[]>(() => {
  const tree = buildFileTree([], activeProject.value?.untrackedFiles || []);
  return flattenTreeRows(tree, collapsedUntrackedTreeDirectoryPaths.value);
});

const activeDiffText = computed(() => expandedDiffPreview.value?.diff || activeProject.value?.diff || '');

const currentDiffFiles = computed(() => {
  const files = activeProject.value?.files || [];
  return selectedFilePath.value ? files.filter((file) => file.path === selectedFilePath.value) : files;
});

const currentDiffAdditions = computed(() => currentDiffFiles.value.reduce((sum, file) => sum + (file.additions || 0), 0));

const currentDiffDeletions = computed(() => currentDiffFiles.value.reduce((sum, file) => sum + (file.deletions || 0), 0));

const maxCurrentChangeSize = computed(() => Math.max(1, ...currentDiffFiles.value.map((file) => (file.additions || 0) + (file.deletions || 0))));

const renderedDiffFiles = computed<RenderedDiffFile[]>(() =>
  currentDiffFiles.value
    .map((file) => {
      const diff = extractFileDiffSections(activeDiffText.value, file.path).join('\n');
      if (!diff.trim()) {
        return undefined;
      }
      const changeSize = (file.additions || 0) + (file.deletions || 0);
      return {
        file,
        diff,
        html: diffToHtml(diff, {
          drawFileList: false,
          matching: 'lines',
          outputFormat: diffViewMode.value
        }),
        firstChangedLine: findFirstChangedNewLine(diff),
        changeSize,
        heatPercent: Math.max(8, Math.round((changeSize / maxCurrentChangeSize.value) * 100))
      };
    })
    .filter((item): item is RenderedDiffFile => Boolean(item))
);

const filePreviewLines = computed(() =>
  (filePreview.value?.content || '').split('\n').map((text, index) => ({
    number: index + 1,
    text
  }))
);


function toggleTreeDirectory(treeKind: 'changed' | 'untracked', directoryPath: string) {
  const source = treeKind === 'changed' ? collapsedChangedTreeDirectoryPaths : collapsedUntrackedTreeDirectoryPaths;
  const collapsed = new Set(source.value);
  if (collapsed.has(directoryPath)) {
    collapsed.delete(directoryPath);
  } else {
    collapsed.add(directoryPath);
  }
  source.value = [...collapsed];
}

function treeIndentStyle(depth: number) {
  return {
    width: `${Math.max(depth, 0) * 14}px`
  };
}

function isUntrackedSelected(filePath: string): boolean {
  return selectedUntrackedFilePaths.value.includes(filePath);
}

function toggleUntrackedFile(filePath: string, selected: boolean) {
  selectedUntrackedFilePaths.value = selected
    ? [...new Set([...selectedUntrackedFilePaths.value, filePath])]
    : selectedUntrackedFilePaths.value.filter((item) => item !== filePath);
}

function setAllUntrackedFiles(selected: boolean) {
  selectedUntrackedFilePaths.value = selected ? [...allUntrackedFilePaths.value] : [];
}

async function stageSelectedUntrackedFiles() {
  if (!props.requirementId || !activeProject.value || !selectedUntrackedCount.value) {
    return;
  }
  const files = selectedUntrackedFilePaths.value.filter((filePath) => allUntrackedFilePaths.value.includes(filePath));
  isStagingUntracked.value = true;
  try {
    const summary = await apiClient.stageUntrackedFiles(props.requirementId, {
      projectPath: activeProject.value.project.path,
      files
    });
    selectedUntrackedFilePaths.value = [];
    emit('updated', summary);
    ElMessage.success(`已加入暂存区 ${files.length} 个待确认新文件`);
  } catch (error: any) {
    ElMessage.error(error.message || '加入暂存区失败');
  } finally {
    isStagingUntracked.value = false;
  }
}

function isDiffFileCollapsed(filePath: string): boolean {
  return collapsedDiffFilePaths.value.includes(filePath);
}

function toggleDiffFile(filePath: string) {
  collapsedDiffFilePaths.value = isDiffFileCollapsed(filePath)
    ? collapsedDiffFilePaths.value.filter((item) => item !== filePath)
    : [...new Set([...collapsedDiffFilePaths.value, filePath])];
}

function collapseAllDiffFiles() {
  collapsedDiffFilePaths.value = [...new Set([...collapsedDiffFilePaths.value, ...renderedDiffFiles.value.map((item) => item.file.path)])];
}

function expandAllDiffFiles() {
  const currentPaths = new Set(renderedDiffFiles.value.map((item) => item.file.path));
  collapsedDiffFilePaths.value = collapsedDiffFilePaths.value.filter((filePath) => !currentPaths.has(filePath));
}

async function loadDiffContext() {
  if (!props.requirementId || !activeProject.value) {
    return;
  }
  if (diffContextLines.value === 3) {
    expandedDiffPreview.value = undefined;
    return;
  }
  isLoadingExpandedDiff.value = true;
  try {
    const preview = await apiClient.getGitDiffPreview(props.requirementId, {
      projectPath: activeProject.value.project.path,
      filePath: selectedFilePath.value || undefined,
      contextLines: diffContextLines.value
    });
    expandedDiffPreview.value = preview;
    if (preview.truncated) {
      ElMessage.warning('扩展上下文后的 diff 内容过长，已截断展示');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载扩展上下文失败');
  } finally {
    isLoadingExpandedDiff.value = false;
  }
}

async function handleDiffFileCommand(command: string, item: RenderedDiffFile) {
  if (command === 'view') {
    await openFilePreview(item);
    return;
  }
  if (command === 'copy') {
    await copyDiffFilePath(item.file.path);
  }
}

async function copyDiffFilePath(filePath: string) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('当前环境不支持剪贴板写入');
    }
    await navigator.clipboard.writeText(filePath);
    ElMessage.success('已复制文件路径');
  } catch (error: any) {
    ElMessage.error(error.message || '复制文件路径失败');
  }
}

async function openFilePreview(item: RenderedDiffFile) {
  if (!props.requirementId || !activeProject.value) {
    return;
  }
  filePreviewVisible.value = true;
  filePreviewLoading.value = true;
  filePreviewError.value = '';
  filePreview.value = undefined;
  filePreviewTarget.value = item;
  try {
    filePreview.value = await apiClient.getGitChangedFilePreview(props.requirementId, {
      projectPath: activeProject.value.project.path,
      filePath: item.file.path,
      focusLine: item.firstChangedLine
    });
    await nextTick();
    scrollFilePreviewToFocus();
  } catch (error: any) {
    filePreviewError.value = error.message || '读取文件失败';
  } finally {
    filePreviewLoading.value = false;
  }
}

function scrollFilePreviewToFocus() {
  const focusLine = filePreview.value?.focusLine;
  if (!focusLine || !filePreviewContentRef.value) {
    return;
  }
  filePreviewContentRef.value.querySelector<HTMLElement>(`[data-line="${focusLine}"]`)?.scrollIntoView?.({ block: 'center' });
}

function resetDiffWorkbenchState() {
  diffContextLines.value = 3;
  expandedDiffPreview.value = undefined;
  collapsedDiffFilePaths.value = [];
}

function pruneCollapsedDiffFiles() {
  const validPaths = new Set(currentDiffFiles.value.map((file) => file.path));
  collapsedDiffFilePaths.value = collapsedDiffFilePaths.value.filter((filePath) => validPaths.has(filePath));
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
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
  () => props.summary,
  () => {
    activeProjectPath.value = summaryView.value?.projects[0]?.project.path || '';
    selectedFilePath.value = '';
    selectedUntrackedFilePaths.value = [];
    collapsedChangedTreeDirectoryPaths.value = [];
    collapsedUntrackedTreeDirectoryPaths.value = [];
    resetDiffWorkbenchState();
  },
  { immediate: true }
);

watch(activeProjectPath, () => {
  selectedFilePath.value = '';
  selectedUntrackedFilePaths.value = [];
  collapsedChangedTreeDirectoryPaths.value = [];
  collapsedUntrackedTreeDirectoryPaths.value = [];
  resetDiffWorkbenchState();
});

watch(allUntrackedFilePaths, () => {
  selectedUntrackedFilePaths.value = selectedUntrackedFilePaths.value.filter((filePath) => allUntrackedFilePaths.value.includes(filePath));
});

watch(selectedFilePath, () => {
  resetDiffWorkbenchState();
});

watch(currentDiffFiles, () => {
  pruneCollapsedDiffFiles();
});

onMounted(() => {
  window.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscape);
});
</script>

<style scoped>
.git-inspector {
  display: grid;
  gap: 12px;
}

.git-overview,
.git-project-summary,
.git-diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.git-overview {
  padding: 14px 16px;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #ffffff;
}

.git-overview strong,
.git-overview p,
.git-diff-toolbar strong,
.git-diff-toolbar p {
  margin: 0;
}

.git-metrics,
.git-project-summary {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: #60708f;
}

.additions {
  color: #0f9f6e;
}

.deletions {
  color: #e02424;
}

.pending-files {
  color: #b45309;
}

.project-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.git-project-alert {
  margin: 0;
}

.git-project-summary {
  justify-content: flex-start;
  padding: 10px 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #f8fafc;
}

.git-review-layout {
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  min-height: 560px;
  overflow: hidden;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #ffffff;
}

.git-file-pane {
  overflow: auto;
  border-right: 1px solid #e5eaf3;
  background: #f8fafc;
}

.git-file-pane-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #edf1f7;
  background: #f8fafc;
}

.git-untracked-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.git-file-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 8px;
  width: 100%;
  padding: 11px 12px;
  color: #1f2a44;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #edf1f7;
  background: transparent;
  cursor: pointer;
}

.git-file-row:hover,
.git-file-row.active {
  background: #eef5ff;
}

.git-tree-scroll {
  width: 100%;
  min-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.git-tree-section {
  width: max-content;
  min-width: 100%;
  border-bottom: 1px solid #edf1f7;
}

.git-tree-section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  min-width: 100%;
  padding: 7px 10px;
  color: #334155;
  background: #eef2f7;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.git-tree-section-title span {
  color: #60708f;
}

.git-tree-row {
  min-width: 100%;
}

.git-tree-directory-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  min-width: 100%;
  padding: 4px 10px;
  color: #334155;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.git-tree-directory-row:hover {
  background: #e7edf5;
}

.git-tree-indent {
  flex: 0 0 auto;
  height: 1px;
}

.git-tree-toggle {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  color: #60708f;
  border: 0;
  background: transparent;
  font-size: 12px;
  line-height: 1;
}

.git-tree-directory-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: max-content;
  white-space: nowrap;
}

.git-tree-directory-content strong,
.git-tree-directory-content span {
  overflow: visible;
  white-space: nowrap;
}

.git-tree-directory-content span {
  color: #60708f;
  font-size: 12px;
}

.git-tree-file-row {
  display: flex;
  align-items: center;
  width: max-content;
  min-width: 100%;
  padding: 4px 10px;
  line-height: 18px;
  white-space: nowrap;
}

.git-tree-file-row .git-file-flags,
.git-tree-file-row .git-file-stat {
  grid-column: auto;
}

.git-tree-untracked-row {
  align-items: center;
  width: max-content;
  min-width: 100%;
  padding: 4px 10px;
  background: #ffffff;
  line-height: 18px;
  white-space: nowrap;
}

.git-tree-file-row .git-file-path,
.git-tree-untracked-row .git-file-path {
  overflow: visible;
  overflow-wrap: normal;
  white-space: nowrap;
  word-break: normal;
}

.git-untracked-section {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #edf1f7;
}

.git-untracked-title,
.git-untracked-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.git-untracked-row {
  padding: 6px 0;
}

.git-untracked-row.selected {
  background: #fff7ed;
}

.git-untracked-section p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.git-file-status {
  min-width: 30px;
  padding: 1px 6px;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #eff6ff;
  font-size: 12px;
  text-align: center;
}

.git-file-status.all {
  color: #0f9f6e;
  border-color: #a7f3d0;
  background: #ecfdf5;
}

.git-file-status.pending {
  color: #92400e;
  border-color: #fde68a;
  background: #fef3c7;
}

.git-file-path {
  min-width: 0;
  overflow: visible;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
  word-break: break-word;
  line-height: 1.45;
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

.git-file-flags,
.git-file-stat {
  grid-column: 2;
}

.git-file-flags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.git-file-stat {
  color: #60708f;
  font-size: 12px;
}

.git-diff-pane {
  min-width: 0;
  overflow: auto;
  background: #ffffff;
}

.git-diff-pane.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
}

.git-diff-toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 14px;
  border-bottom: 1px solid #e5eaf3;
  background: #ffffff;
}

.git-diff-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.git-diff-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.git-diff-total {
  color: #60708f;
  font-size: 12px;
  white-space: nowrap;
}

.git-context-select {
  height: 28px;
  padding: 0 8px;
  color: #334155;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
}

.git-diff-context-alert {
  margin: 10px 12px 0;
}

.git-diff-html {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.git-diff-pane.fullscreen .git-diff-html {
  flex: 1;
}

.git-diff-file-card {
  overflow: hidden;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #ffffff;
}

.git-diff-file-header {
  display: grid;
  grid-template-columns: auto 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #e5eaf3;
  background: #f8fafc;
}

.git-diff-file-card.collapsed .git-diff-file-header {
  border-bottom: 0;
}

.git-diff-file-toggle {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: #475569;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  line-height: 1;
}

.git-diff-file-heat {
  display: inline-flex;
  align-items: center;
  width: 48px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf2f7;
}

.git-diff-file-heat span {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e 0%, #0ea5e9 100%);
}

.git-diff-file-meta {
  min-width: 0;
}

.git-diff-file-meta strong,
.git-diff-file-meta p {
  margin: 0;
}

.git-diff-file-meta strong {
  display: block;
  overflow-wrap: anywhere;
  color: #1f2a44;
  line-height: 1.4;
}

.git-diff-file-meta p {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: #60708f;
  font-size: 12px;
}

.git-diff-file-menu {
  font-weight: 700;
}

.git-diff-file-body {
  overflow: auto;
}

.git-diff-html :deep(.d2h-file-header) {
  display: none;
}

.git-diff-html :deep(.d2h-file-wrapper) {
  margin-bottom: 0;
  border: 0;
  border-radius: 0;
}

.git-file-preview-title strong,
.git-file-preview-title p {
  margin: 0;
}

.git-file-preview-title p {
  margin-top: 4px;
  color: #60708f;
  font-size: 12px;
}

.git-file-preview-body {
  min-height: 320px;
}

.git-file-preview-code {
  max-height: 70vh;
  margin: 0;
  padding: 12px 0 12px 56px;
  overflow: auto;
  border: 1px solid #e5eaf3;
  border-radius: 8px;
  background: #0f172a;
  color: #e5edf7;
  font-family: Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
}

.git-file-preview-line {
  padding: 0 12px;
}

.git-file-preview-line::marker {
  color: #94a3b8;
}

.git-file-preview-line.focus {
  background: #334155;
  color: #ffffff;
}

@media (max-width: 960px) {
  .git-review-layout {
    grid-template-columns: 1fr;
  }

  .git-file-pane {
    max-height: 320px;
    border-right: 0;
    border-bottom: 1px solid #e5eaf3;
  }

  .git-diff-toolbar,
  .git-overview {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-diff-actions {
    justify-content: flex-start;
  }

  .git-diff-file-header {
    grid-template-columns: auto 42px minmax(0, 1fr);
  }

  .git-diff-file-menu {
    grid-column: 3;
    justify-self: flex-start;
  }
}
</style>
