import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import ArtifactGitSyncPanel from '../../src/components/ArtifactGitSyncPanel.vue';
import type { ArtifactGitSyncPlan } from '@/api/client';

function componentStubs() {
  return {
    ElButton: {
      props: ['disabled', 'loading'],
      emits: ['click'],
      template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
    },
    ElCheckbox: {
      props: ['modelValue', 'indeterminate'],
      emits: ['change'],
      template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked)" /><slot /></label>'
    },
    ElEmpty: {
      props: ['description'],
      template: '<div>{{ description }}<slot /></div>'
    },
    ElRadioButton: {
      template: '<span><slot /></span>'
    },
    ElRadioGroup: {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template:
        '<div><button class="radio-flat" @click="$emit(\'update:modelValue\', \'flat\')">平铺</button><button class="radio-tree" @click="$emit(\'update:modelValue\', \'tree\')">目录</button><button class="radio-line" @click="$emit(\'update:modelValue\', \'line-by-line\')">统一视图</button><button class="radio-side" @click="$emit(\'update:modelValue\', \'side-by-side\')">左右对比</button><slot /></div>'
    }
  };
}

function syncPlan(): ArtifactGitSyncPlan {
  return {
    requirementId: '172014',
    stage: 'PRD',
    syncType: 'PUBLIC_SYNC',
    blocked: false,
    blockers: [],
    repoPath: '/tmp/demo',
    headCommit: 'aaa',
    remoteCommit: 'aaa',
    files: [
      {
        path: 'docs/172014/prd/analysis.md',
        status: 'M',
        selected: true
      },
      {
        path: 'docs/172014/technical-design/design_review.md',
        status: 'M',
        selected: true
      }
    ],
    diff: [
      'diff --git a/docs/172014/prd/analysis.md b/docs/172014/prd/analysis.md',
      'index e69de29..4b825dc 100644',
      '--- a/docs/172014/prd/analysis.md',
      '+++ b/docs/172014/prd/analysis.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/docs/172014/technical-design/design_review.md b/docs/172014/technical-design/design_review.md',
      'index e69de29..4b825dc 100644',
      '--- a/docs/172014/technical-design/design_review.md',
      '+++ b/docs/172014/technical-design/design_review.md',
      '@@ -1 +1 @@',
      '-design old',
      '+design new'
    ].join('\n')
  };
}

function mountPanel(initialSelectedFiles = syncPlan().files.map((file) => file.path)) {
  return mount(
    defineComponent({
      components: { ArtifactGitSyncPanel },
      setup() {
        const plan = syncPlan();
        const selectedFiles = ref(initialSelectedFiles);
        return { plan, selectedFiles };
      },
      template: '<ArtifactGitSyncPanel v-model:selected-files="selectedFiles" :plan="plan" />'
    }),
    {
      global: {
        stubs: componentStubs()
      }
    }
  );
}

describe('ArtifactGitSyncPanel', () => {
  it('支持文件选择，并只展示已选文件 diff', async () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain('docs/172014/prd/analysis.md');
    expect(wrapper.find('.sync-diff-html').text()).toContain('analysis.md');
    expect(wrapper.find('.sync-diff-html').text()).toContain('design_review.md');

    await wrapper.findAll('.sync-file-row input')[1].setValue(false);

    expect((wrapper.vm as any).selectedFiles).toEqual(['docs/172014/prd/analysis.md']);
    expect(wrapper.find('.sync-diff-html').text()).toContain('analysis.md');
    expect(wrapper.find('.sync-diff-html').text()).not.toContain('design_review.md');
  });

  it('复用目录树视图并支持 diff 全屏 ESC 退出', async () => {
    const wrapper = mountPanel();

    await wrapper.find('.radio-tree').trigger('click');
    expect(wrapper.find('.sync-tree-directory-row').exists()).toBe(true);
    expect(wrapper.text()).toContain('technical-design');

    expect(wrapper.find('.sync-diff-pane').classes()).not.toContain('fullscreen');
    await wrapper.find('.sync-diff-actions > button').trigger('click');
    expect(wrapper.find('.sync-diff-pane').classes()).toContain('fullscreen');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sync-diff-pane').classes()).not.toContain('fullscreen');
  });
});
