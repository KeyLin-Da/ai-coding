import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SupplementInputDialog from '../../src/components/SupplementInputDialog.vue';

function mountDialog(props: Partial<InstanceType<typeof SupplementInputDialog>['$props']> = {}) {
  return mount(SupplementInputDialog, {
    props: {
      modelValue: true,
      text: '',
      files: [],
      ...props
    },
    global: {
      stubs: {
        ElAlert: {
          props: ['title'],
          template: '<div>{{ title }}</div>'
        },
        ElButton: {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
        },
        ElDialog: {
          props: ['modelValue', 'title', 'width', 'top'],
          emits: ['update:modelValue', 'open'],
          mounted() {
            if (this.modelValue) {
              this.$emit('open');
            }
          },
          template: '<div v-if="modelValue" class="dialog-stub"><h3>{{ title }}</h3><slot /><slot name="footer" /></div>'
        },
        ElInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<textarea :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        ElIcon: {
          template: '<span><slot /></span>'
        }
      }
    }
  });
}

function clipboardItem(type: string, file?: File) {
  return {
    type,
    getAsFile: () => file || null
  };
}

function pastePayload(text: string, items: Array<ReturnType<typeof clipboardItem>> = []) {
  return {
    clipboardData: {
      items,
      getData: (type: string) => (type === 'text/plain' ? text : '')
    }
  };
}

describe('SupplementInputDialog', () => {
  it('以紧凑提示条展示补充说明 notice', () => {
    const wrapper = mountDialog({ notice: '用于补充约束、评审意见或二次修改说明。' });

    expect(wrapper.find('.supplement-notice').text()).toContain('用于补充约束');
  });

  it('粘贴纯文本时保存为 Markdown 和 blocks', async () => {
    const wrapper = mountDialog({ text: '已有说明' });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('新增说明'));
    await wrapper.findAll('button').find((button) => button.text().includes('保存补充输入'))?.trigger('click');

    expect(wrapper.emitted('update:text')?.[0]).toEqual(['已有说明\n\n新增说明']);
    expect(wrapper.emitted('update:blocks')?.[0]?.[0]).toMatchObject([
      { type: 'PARAGRAPH', text: '已有说明' },
      { type: 'PARAGRAPH', text: '新增说明' }
    ]);
    expect(wrapper.emitted('save')?.[0]).toEqual(['已有说明\n\n新增说明']);
  });

  it('粘贴图片时转为上传文件并保留正文内预览', async () => {
    const image = new File(['image-bytes'], 'clipboard.png', { type: 'image/png' });
    const wrapper = mountDialog({
      files: [
        {
          id: 'file-1',
          name: 'clipboard.png',
          path: 'docs/172014/prd/files/clipboard.png',
          size: 11,
          mimeType: 'image/png'
        }
      ]
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('', [clipboardItem('image/png', image)]));

    const uploaded = wrapper.emitted('upload-files')?.[0]?.[0] as File[];
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].name).toMatch(/^pasted-\d{14}-1\.png$/);
    expect(uploaded[0].type).toBe('image/png');
    await wrapper.findAll('button').find((button) => button.text().includes('保存补充输入'))?.trigger('click');
    expect(
      (wrapper.emitted('update:blocks')?.at(-1)?.[0] as Array<{ contextRole?: string }>).some((block) => block.contextRole === 'INLINE')
    ).toBe(true);
    expect(wrapper.find('.comment-editor-surface').exists()).toBe(true);
    expect(wrapper.find('.image-preview img').attributes('alt')).toBe('clipboard.png');
  });

  it('上传接口返回真实文件后保留粘贴图片的内联来源', async () => {
    const image = new File(['image-bytes'], 'clipboard.png', { type: 'image/png' });
    const wrapper = mountDialog();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('', [clipboardItem('image/png', image)]));
    await wrapper.setProps({
      files: [
        {
          id: 'file-1',
          name: 'pasted-20260717090000-1.png',
          path: 'docs/172014/prd/files/pasted-20260717090000-1.png',
          size: 11,
          mimeType: 'image/png'
        }
      ]
    });
    await wrapper.findAll('button').find((button) => button.text().includes('保存补充输入'))?.trigger('click');

    expect(wrapper.emitted('update:blocks')?.at(-1)?.[0]).toMatchObject([
      {
        type: 'IMAGE',
        path: 'docs/172014/prd/files/pasted-20260717090000-1.png',
        contextRole: 'INLINE'
      }
    ]);
    expect(wrapper.emitted('update:text')?.at(-1)?.[0]).toContain('docs/172014/prd/files/pasted-20260717090000-1.png');
  });

  it('粘贴图文混合内容时拆分文本和图片', async () => {
    const image = new File(['image-bytes'], 'mixed.png', { type: 'image/png' });
    const wrapper = mountDialog();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('图文说明', [clipboardItem('image/png', image)]));
    await wrapper.findAll('button').find((button) => button.text().includes('保存补充输入'))?.trigger('click');

    const uploaded = wrapper.emitted('upload-files')?.[0]?.[0] as File[];
    expect(uploaded).toHaveLength(1);
    expect(wrapper.emitted('update:text')?.[0]?.[0]).toContain('图文说明');
    expect(wrapper.emitted('update:text')?.[0]?.[0]).toContain('[图片上传中:');
  });

  it('移除附件时只更新当前补充输入，不触发物理删除事件', async () => {
    const wrapper = mountDialog({
      files: [
        {
          id: 'file-1',
          name: '补充材料.md',
          path: 'docs/172014/technical-design/file/file-1.md',
          size: 128,
          mimeType: 'text/markdown'
        }
      ]
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('button[aria-label="从本次补充移除"]').trigger('click');
    await wrapper.findAll('button').find((button) => button.text().includes('保存补充输入'))?.trigger('click');

    expect(wrapper.emitted('delete-file')).toBeUndefined();
    expect(wrapper.emitted('update:blocks')?.at(-1)?.[0]).toEqual([]);
  });

  it('上传失败时保存失败占位且不丢已有文本', async () => {
    const image = new File(['image-bytes'], 'fail.png', { type: 'image/png' });
    const wrapper = mountDialog({ text: '失败前说明', uploading: true });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('', [clipboardItem('image/png', image)]));
    await wrapper.setProps({ uploading: false });
    await wrapper.findAll('button').find((button) => button.text().includes('保存补充输入'))?.trigger('click');

    expect(wrapper.text()).toContain('上传失败，请重试或移除。');
    expect(wrapper.emitted('update:text')?.[0]?.[0]).toContain('失败前说明');
    expect(wrapper.emitted('update:text')?.[0]?.[0]).toContain('[图片上传失败:');
  });

  it('展示历史输入列表并提供查看入口', () => {
    const wrapper = mountDialog({
      history: [
        {
          id: 'run-1',
          actionType: 'DESIGN_GENERATE',
          path: 'docs/172014/workflow/supplements/20260717090000-design_generate-run-1.md',
          createdAt: '2026-07-17T09:00:00.000Z'
        }
      ]
    });

    expect(wrapper.find('.history-header').text()).toContain('1 条');
    expect(wrapper.find('.history-item').text()).toContain('技术方案生成');
    expect(wrapper.find('.history-link').attributes('href')).toContain('docs/172014/workflow/supplements/20260717090000-design_generate-run-1.md');
  });
});
