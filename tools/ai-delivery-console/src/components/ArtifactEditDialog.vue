<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    fullscreen
    destroy-on-close
    :close-on-click-modal="false"
    class="artifact-edit-dialog"
    @closed="reset"
  >
    <div class="artifact-edit-workspace">
      <MarkdownEditor
        v-if="artifactPath"
        :key="artifactPath"
        :title="editorTitle"
        :artifact-path="artifactPath"
        :project-id="projectId"
        @saved="handleSaved"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';

type SavedHandler = () => void | Promise<void>;

const visible = ref(false);
const editorTitle = ref('');
const artifactPath = ref('');
const projectId = ref<string | number>('');
let savedHandler: SavedHandler | undefined;

const dialogTitle = computed(() => (editorTitle.value ? `编辑${editorTitle.value}` : '编辑产物'));

function open(input: { title: string; artifactPath: string; projectId: string | number; onSaved?: SavedHandler }) {
  editorTitle.value = input.title;
  artifactPath.value = input.artifactPath;
  projectId.value = input.projectId;
  savedHandler = input.onSaved;
  visible.value = true;
}

async function handleSaved() {
  await savedHandler?.();
}

function reset() {
  editorTitle.value = '';
  artifactPath.value = '';
  projectId.value = '';
  savedHandler = undefined;
}

defineExpose({ open });
</script>

<style scoped>
:global(.artifact-edit-dialog.el-dialog.is-fullscreen) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: #f5f7fb;
}

:global(.artifact-edit-dialog.el-dialog.is-fullscreen > .el-dialog__body) {
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}

.artifact-edit-workspace {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.artifact-edit-workspace :deep(.workspace-band) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
}

.artifact-edit-workspace :deep(.editor-layout) {
  min-height: 0;
  height: 100%;
}
</style>
