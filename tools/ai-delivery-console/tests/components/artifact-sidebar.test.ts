import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ArtifactSidebar from '../../src/components/ArtifactSidebar.vue';

describe('ArtifactSidebar', () => {
  it('展示产物和阻断问题，并允许选择产物', async () => {
    const wrapper = mount(ArtifactSidebar, {
      props: {
        artifacts: [
          {
            id: 'prd',
            stage: 'PRD',
            label: 'PRD 分析文档',
            path: 'docs/172014/prd/analysis.md',
            kind: 'markdown',
            exists: true
          }
        ],
        issues: [
          {
            id: 'IS-001',
            stage: 'CODE_REVIEW',
            severity: 'BLOCKER',
            title: '阻断问题',
            status: 'OPEN'
          }
        ]
      }
    });

    expect(wrapper.text()).toContain('PRD 分析文档');
    expect(wrapper.text()).toContain('阻断问题');
    await wrapper.find('.artifact-row').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['docs/172014/prd/analysis.md']);
  });
});
