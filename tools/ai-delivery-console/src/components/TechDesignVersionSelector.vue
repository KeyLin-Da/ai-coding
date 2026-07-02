<template>
  <div class="tech-design-version-selector">
    <el-select
      :model-value="modelValue"
      class="version-select"
      filterable
      size="small"
      :loading="loading"
      placeholder="选择版本"
      @update:model-value="(value) => $emit('update:modelValue', String(value))"
    >
      <el-option
        v-for="version in versions"
        :key="version.id"
        :label="versionLabel(version)"
        :value="version.id"
        :disabled="!version.readable"
      >
        <span class="version-option">
          <span>{{ versionLabel(version) }}</span>
          <small v-if="version.unreadableReason">{{ version.unreadableReason }}</small>
        </span>
      </el-option>
    </el-select>
    <el-button size="small" :disabled="versions.length < 2 || !modelValue" @click="$emit('compare')">对比版本</el-button>
  </div>
</template>

<script setup lang="ts">
import type { TechDesignVersion } from '@shared/workflow';

withDefaults(
  defineProps<{
    modelValue: string;
    versions: TechDesignVersion[];
    loading?: boolean;
  }>(),
  {
    loading: false
  }
);

defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'compare'): void;
}>();

function versionLabel(version: TechDesignVersion): string {
  const parts = [version.label];
  if (version.versionNo && !version.label.includes(`v${version.versionNo}`)) {
    parts.push(`v${version.versionNo}`);
  }
  if (version.commitSha) {
    parts.push(version.commitSha.slice(0, 8));
  }
  return parts.join(' · ');
}
</script>

<style scoped>
.tech-design-version-selector {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.version-select {
  width: 220px;
}

.version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.version-option small {
  color: #9ca3af;
}
</style>
