import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { SupplementBlock } from '../../shared/workflow';
import SupplementComposer from '../../src/components/SupplementComposer.vue';

function mountComposer(props: Partial<InstanceType<typeof SupplementComposer>['$props']> = {}) {
  return mount(SupplementComposer, {
    props: {
      modelValue: [],
      ...props
    },
    global: {
      stubs: {
        ElButton: {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
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
    preventDefault: vi.fn(),
    clipboardData: {
      items,
      getData: (type: string) => (type === 'text/plain' ? text : '')
    }
  };
}

describe('SupplementComposer', () => {
  it('只展示一个上传附件入口', () => {
    const wrapper = mountComposer();

    const uploadButtons = wrapper.findAll('button').filter((button) => button.text().includes('上传附件'));
    expect(uploadButtons).toHaveLength(1);
    expect(wrapper.find('.composer-footer').text()).toContain('上传附件');
  });

  it('段落不展示块级删除按钮，避免误解为清空全部', () => {
    const wrapper = mountComposer({
      modelValue: [{ id: 'p1', type: 'PARAGRAPH', text: '已有说明' }]
    });

    expect(wrapper.find('button[aria-label="删除段落"]').exists()).toBe(false);
  });

  it('清空本次补充时只清空当前 blocks，不删除已上传附件源文件', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const blocks: SupplementBlock[] = [
      { id: 'p1', type: 'PARAGRAPH', text: '已有说明' },
      {
        id: 'img1',
        type: 'IMAGE',
        fileId: 'file-img',
        name: 'screen.png',
        path: 'docs/100/prd/files/screen.png',
        size: 120,
        mimeType: 'image/png'
      }
    ];
    const wrapper = mountComposer({ modelValue: blocks });

    await wrapper.find('button[aria-label="清空本次补充"]').trigger('click');

    expect(confirmSpy).toHaveBeenCalledWith('确认清空本次补充？');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([]);
    expect(wrapper.emitted('delete-file')).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it('点击空白编辑区后创建可输入段落', async () => {
    const wrapper = mountComposer();

    await wrapper.find('.comment-editor-surface').trigger('click');
    await wrapper.vm.$nextTick();

    const editor = wrapper.find<HTMLTextAreaElement>('textarea.paragraph-editor');
    expect(editor.exists()).toBe(true);
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[])[0]).toMatchObject({
      type: 'PARAGRAPH',
      text: ''
    });
  });

  it('段落输入时保留原始内容，不在按键过程中 trim 或重建光标节点', async () => {
    const wrapper = mountComposer({
      modelValue: [{ id: 'p1', type: 'PARAGRAPH', text: '已有说明' }]
    });
    const editor = wrapper.find<HTMLTextAreaElement>('textarea.paragraph-editor');

    await editor.setValue('  已有说明继续  ');

    const nextBlocks = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[];
    expect(nextBlocks[0]).toMatchObject({ type: 'PARAGRAPH', text: '  已有说明继续  ' });
    expect((editor.element as HTMLTextAreaElement).value).toBe('  已有说明继续  ');
  });

  it('在同一个评论式编辑面中按顺序展示段落、图片和附件 chip', () => {
    const blocks: SupplementBlock[] = [
      { id: 'p1', type: 'PARAGRAPH', text: '第一段' },
      {
        id: 'img1',
        type: 'IMAGE',
        fileId: 'file-img',
        name: 'screen.png',
        path: 'docs/100/prd/files/screen.png',
        size: 120,
        mimeType: 'image/png'
      },
      {
        id: 'doc1',
        type: 'FILE',
        fileId: 'file-doc',
        name: 'note.md',
        path: 'docs/100/prd/files/note.md',
        size: 80,
        mimeType: 'text/markdown'
      }
    ];

    const wrapper = mountComposer({ modelValue: blocks });
    const rendered = wrapper.findAll('.comment-node');

    expect(rendered).toHaveLength(3);
    expect(rendered[0].classes()).toContain('is-paragraph');
    expect(rendered[1].find('img').attributes('alt')).toBe('screen.png');
    expect(rendered[1].find('.image-preview').exists()).toBe(true);
    expect(rendered[2].find('.comment-file-chip').exists()).toBe(true);
    expect(rendered[2].text()).toContain('note.md');
  });

  it('在当前块后粘贴图片并触发上传', async () => {
    const image = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const wrapper = mountComposer({
      modelValue: [
        { id: 'p1', type: 'PARAGRAPH', text: '前文' },
        { id: 'p2', type: 'PARAGRAPH', text: '后文' }
      ]
    });

    await wrapper.findAll('.comment-node')[0].trigger('click');
    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('', [clipboardItem('image/png', image)]));

    const uploaded = wrapper.emitted('upload-files')?.[0];
    expect((uploaded?.[0] as File[])[0].name).toMatch(/^pasted-\d{14}-1\.png$/);
    expect(uploaded?.[1]).toBe(1);

    const nextBlocks = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[];
    expect(nextBlocks.map((block) => block.type)).toEqual(['PARAGRAPH', 'IMAGE', 'PARAGRAPH']);
    expect(nextBlocks[1]).toMatchObject({ name: expect.stringMatching(/^pasted-/), status: 'UPLOADING', contextRole: 'INLINE' });
  });

  it('粘贴图片到末尾后自动追加可输入正文段落', async () => {
    const image = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const wrapper = mountComposer({
      modelValue: [{ id: 'p1', type: 'PARAGRAPH', text: '前文' }]
    });

    await wrapper.findAll('.comment-node')[0].trigger('click');
    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('', [clipboardItem('image/png', image)]));
    await wrapper.vm.$nextTick();

    const nextBlocks = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[];
    expect(nextBlocks.map((block) => block.type)).toEqual(['PARAGRAPH', 'IMAGE', 'PARAGRAPH']);
    expect(nextBlocks[2]).toMatchObject({ type: 'PARAGRAPH', text: '' });
    expect(wrapper.findAll('textarea.paragraph-editor')).toHaveLength(2);
  });

  it('上传文件到末尾后自动追加可输入正文段落', async () => {
    const file = new File(['note'], 'note.md', { type: 'text/markdown' });
    const wrapper = mountComposer();
    const input = wrapper.find<HTMLInputElement>('input.hidden-file-input');
    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true
    });

    await input.trigger('change');
    await wrapper.vm.$nextTick();

    const nextBlocks = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[];
    expect(nextBlocks.map((block) => block.type)).toEqual(['FILE', 'PARAGRAPH']);
    expect(nextBlocks[0]).toMatchObject({ type: 'FILE', contextRole: 'ATTACHMENT' });
    expect(nextBlocks[1]).toMatchObject({ type: 'PARAGRAPH', text: '' });
    expect(wrapper.emitted('upload-files')?.[0]?.[1]).toBe(0);
  });

  it('点击图片结尾后的空白编辑区时追加正文段落', async () => {
    const wrapper = mountComposer({
      modelValue: [
        { id: 'p1', type: 'PARAGRAPH', text: '前文' },
        {
          id: 'img1',
          type: 'IMAGE',
          fileId: 'file-img',
          name: 'screen.png',
          path: 'docs/100/prd/files/screen.png',
          size: 120,
          mimeType: 'image/png'
        }
      ]
    });

    await wrapper.find('.comment-editor-surface').trigger('click');
    await wrapper.vm.$nextTick();

    const nextBlocks = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[];
    expect(nextBlocks.map((block) => block.type)).toEqual(['PARAGRAPH', 'IMAGE', 'PARAGRAPH']);
    expect(nextBlocks[2]).toMatchObject({ type: 'PARAGRAPH', text: '' });
  });

  it('粘贴纯文本时插入段落块', async () => {
    const wrapper = mountComposer({
      modelValue: [{ id: 'p1', type: 'PARAGRAPH', text: '已有' }]
    });

    await wrapper.findAll('.comment-node')[0].trigger('click');
    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('新增段落'));

    const nextBlocks = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as SupplementBlock[];
    expect(nextBlocks).toMatchObject([
      { type: 'PARAGRAPH', text: '已有' },
      { type: 'PARAGRAPH', text: '新增段落' }
    ]);
  });

  it('移除文件卡片时只更新当前 blocks，不删除已上传附件源文件', async () => {
    const wrapper = mountComposer({
      modelValue: [
        {
          id: 'doc1',
          type: 'FILE',
          fileId: 'file-doc',
          name: 'note.md',
          path: 'docs/100/prd/files/note.md',
          size: 80,
          mimeType: 'text/markdown'
        }
      ]
    });

    await wrapper.find('button[aria-label="从本次补充移除"]').trigger('click');

    expect(wrapper.emitted('delete-file')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([]);
  });

  it('上传停止但占位未替换时展示失败并允许重试', async () => {
    const image = new File(['image'], 'fail.png', { type: 'image/png' });
    const wrapper = mountComposer({ uploading: true });

    await wrapper.find('.supplement-composer').trigger('paste', pastePayload('', [clipboardItem('image/png', image)]));
    await wrapper.setProps({ uploading: false });

    expect(wrapper.text()).toContain('上传失败，请重试或移除。');

    await wrapper.find('button[aria-label="重试上传"]').trigger('click');
    expect(wrapper.emitted('upload-files')).toHaveLength(2);
  });
});
