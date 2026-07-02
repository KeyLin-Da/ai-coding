<template>
  <aside v-if="items.length" class="markdown-outline" :class="{ collapsed }">
    <button class="outline-toggle" type="button" @click="$emit('update:collapsed', !collapsed)">
      {{ collapsed ? '目录' : '收起目录' }}
    </button>
    <nav v-if="!collapsed" class="outline-list" aria-label="Markdown 目录">
      <button
        v-for="item in items"
        :key="item.id"
        class="outline-item"
        :class="{ active: item.id === activeId }"
        :style="{ paddingLeft: `${Math.max(0, item.level - 1) * 12 + 8}px` }"
        type="button"
        @click="$emit('select', item.id)"
      >
        {{ item.text }}
      </button>
    </nav>
  </aside>
</template>

<script setup lang="ts">
interface MarkdownOutlineItem {
  id: string;
  level: number;
  text: string;
}

defineProps<{
  items: MarkdownOutlineItem[];
  activeId?: string;
  collapsed?: boolean;
}>();

defineEmits<{
  (event: 'select', id: string): void;
  (event: 'update:collapsed', value: boolean): void;
}>();
</script>

<style scoped>
.markdown-outline {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  border-right: 1px solid #e5e7eb;
  background: #ffffff;
  overflow: auto;
}

.markdown-outline.collapsed {
  width: 48px;
}

.outline-toggle {
  flex: 0 0 auto;
  margin: 10px;
  padding: 6px 8px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  color: #475569;
  background: #ffffff;
  font-size: 12px;
  cursor: pointer;
}

.markdown-outline.collapsed .outline-toggle {
  writing-mode: vertical-rl;
}

.outline-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 8px 12px;
}

.outline-item {
  display: block;
  width: 100%;
  margin: 2px 0;
  padding-top: 6px;
  padding-right: 8px;
  padding-bottom: 6px;
  border: 0;
  border-radius: 6px;
  color: #475569;
  background: transparent;
  font-size: 13px;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
}

.outline-item:hover,
.outline-item.active {
  color: #1d4ed8;
  background: #eff6ff;
}
</style>
