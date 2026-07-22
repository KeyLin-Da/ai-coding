import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import OpenSpecVisualContextPicker from '../../src/components/OpenSpecVisualContextPicker.vue';
import type { OpenSpecVisualContextCandidate } from '../../shared/workflow';

function candidates(count = 2): OpenSpecVisualContextCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `candidate-${index + 1}`,
    name: `image-${index + 1}.png`,
    path: `docs/172014/prd/files/image-${index + 1}.png`,
    source: index % 2 === 0 ? 'PRD_FILES' : 'TECH_DESIGN_SOURCE',
    size: 100 + index,
    mimeType: 'image/png'
  }));
}

function mountPicker(props: Partial<InstanceType<typeof OpenSpecVisualContextPicker>['$props']> = {}) {
  return mount(OpenSpecVisualContextPicker, {
    props: {
      candidates: candidates(),
      selectedPaths: [],
      projectId: 10,
      ...props
    },
    global: {
      stubs: {
        ElAlert: {
          props: ['title'],
          template: '<div class="alert-stub">{{ title }}</div>'
        },
        ElButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
        },
        ElCheckbox: {
          props: ['modelValue'],
          emits: ['change'],
          template: '<input class="checkbox-stub" type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked)" />'
        },
        ElEmpty: {
          props: ['description'],
          template: '<div class="empty-stub">{{ description }}</div>'
        },
        ElDialog: {
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template: '<div v-if="modelValue" class="dialog-stub"><h3>{{ title }}</h3><slot /><slot name="footer" /></div>'
        },
        ElSkeleton: { template: '<div class="skeleton-stub" />' },
        ElTag: { template: '<span><slot /></span>' }
      }
    }
  });
}

describe('OpenSpecVisualContextPicker', () => {
  it('默认 0 张选中并展示候选数量', () => {
    const wrapper = mountPicker();

    expect(wrapper.text()).toContain('2 张候选');
    expect(wrapper.text()).toContain('已选 0');
    expect(wrapper.text()).toContain('默认未选择图片');
    expect(wrapper.findAll('.visual-context-item.selected')).toHaveLength(0);
  });

  it('无候选时在弹窗展示空状态', async () => {
    const wrapper = mountPicker({ candidates: [] });

    await wrapper.find('.visual-context-open-button').trigger('click');

    expect(wrapper.find('.empty-stub').text()).toContain('暂无图片候选');
  });

  it('勾选图片只更新弹窗草稿，确认后发出选择路径', async () => {
    const wrapper = mountPicker();

    await wrapper.find('.visual-context-open-button').trigger('click');
    await wrapper.findAll('.checkbox-stub')[0].setValue(true);
    expect(wrapper.emitted('update:selectedPaths')).toBeUndefined();

    await wrapper.find('.visual-context-confirm-button').trigger('click');
    expect(wrapper.emitted('update:selectedPaths')?.[0]).toEqual([['docs/172014/prd/files/image-1.png']]);
  });

  it('取消弹窗时不发出选择变更', async () => {
    const wrapper = mountPicker({ selectedPaths: ['docs/172014/prd/files/image-1.png'] });

    await wrapper.find('.visual-context-open-button').trigger('click');
    await wrapper.findAll('.checkbox-stub')[0].setValue(false);
    await wrapper.findAll('button').find((button) => button.text().includes('取消'))?.trigger('click');

    expect(wrapper.emitted('update:selectedPaths')).toBeUndefined();
  });

  it('提供图片预览链接并可打开预览', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = mountPicker();

    await wrapper.find('.visual-context-open-button').trigger('click');

    expect(wrapper.find('.visual-context-thumb').attributes('href')).toContain('docs/172014/prd/files/image-1.png');
    await wrapper.findAll('button').find((button) => button.text().includes('预览'))?.trigger('click');
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('docs/172014/prd/files/image-1.png'), '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('超过 6 张选择时提示上下文过多', () => {
    const selected = candidates(7).map((item) => item.path);
    const wrapper = mountPicker({ candidates: candidates(7), selectedPaths: selected });

    expect(wrapper.find('.alert-stub').text()).toContain('已选择较多图片');
  });
});
