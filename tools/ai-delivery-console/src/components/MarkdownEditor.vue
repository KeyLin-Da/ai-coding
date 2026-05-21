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
      <article class="markdown-preview" v-html="previewHtml"></article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { DocumentChecked, View } from '@element-plus/icons-vue';
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

const previewHtml = computed(() => md.render(content.value || ''));

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
