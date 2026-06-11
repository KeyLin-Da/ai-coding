import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownEditor from '../../src/components/MarkdownEditor.vue';
import { apiClient } from '@/api/client';
import { ElMessage } from 'element-plus';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn()
  }
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    readArtifact: vi.fn(),
    saveArtifact: vi.fn()
  }
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn()
    }
  };
});

describe('MarkdownEditor collaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('保存时携带 baseVersionId，B70021 时展示冲突提示', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {
        hash: 'hash-v1',
        currentVersionId: 'v1'
      },
      content: 'hello'
    });
    const conflict = new Error('产物已有更新版本') as Error & { code?: string; data?: unknown };
    conflict.code = 'B70021';
    conflict.data = { currentVersionId: 'v2' };
    vi.mocked(apiClient.saveArtifact).mockRejectedValue(conflict);

    const wrapper = mount(MarkdownEditor, {
      props: {
        title: 'PRD',
        artifactPath: 'docs/172014/prd/analysis.md'
      },
      global: {
        stubs: {
          ElButton: {
            props: ['disabled'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
          },
          ElInput: {
            props: ['modelValue'],
            emits: ['update:modelValue', 'scroll'],
            template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
          },
          ElAlert: {
            props: ['title'],
            template: '<div class="conflict-alert-stub">{{ title }}<slot /></div>'
          }
        }
      }
    });
    await flushPromises();

    await (wrapper.vm as any).save();
    await flushPromises();

    expect(apiClient.saveArtifact).toHaveBeenCalledWith('docs/172014/prd/analysis.md', 'hello', 'hash-v1', 'v1');
    expect(wrapper.text()).toContain('当前产物已有新版本 v2');
    expect(ElMessage.warning).toHaveBeenCalledWith('保存冲突，请刷新后合并');
  });

  it('预览时将相对图片路径解析到当前 Markdown 文件目录', async () => {
    vi.mocked(apiClient.readArtifact).mockResolvedValue({
      artifact: {
        hash: 'hash-v1',
        currentVersionId: 'v1'
      },
      content: '![排行榜主页面](files/screenshots/ranking_main_20260610.png)'
    });

    const wrapper = mount(MarkdownEditor, {
      props: {
        title: 'PRD',
        artifactPath: 'docs/141846/prd/analysis.md'
      },
      global: {
        stubs: {
          ElButton: {
            props: ['disabled'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
          },
          ElInput: {
            props: ['modelValue'],
            emits: ['update:modelValue', 'scroll'],
            template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
          },
          ElAlert: {
            props: ['title'],
            template: '<div class="conflict-alert-stub">{{ title }}<slot /></div>'
          }
        }
      }
    });
    await flushPromises();

    expect(wrapper.find('.markdown-preview img').attributes('src')).toBe(
      'http://127.0.0.1:8718/api/artifacts/read?path=docs%2F141846%2Fprd%2Ffiles%2Fscreenshots%2Franking_main_20260610.png'
    );
  });
});
