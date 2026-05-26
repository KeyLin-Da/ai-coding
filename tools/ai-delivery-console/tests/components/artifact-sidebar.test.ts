import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ArtifactSidebar from '../../src/components/ArtifactSidebar.vue';

describe('ArtifactSidebar', () => {
  it('按阶段展示文件产物和阻断问题，并过滤目录产物', async () => {
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
          },
          {
            id: 'openspec-proposal',
            stage: 'IMPLEMENTATION',
            label: 'OpenSpec Proposal',
            path: 'openspec/changes/req-172014/proposal.md',
            kind: 'markdown',
            exists: true
          },
          {
            id: 'openspec-change',
            stage: 'IMPLEMENTATION',
            label: 'OpenSpec Change',
            path: 'openspec/changes/req-172014',
            kind: 'directory',
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

    expect(wrapper.text()).toContain('产物');
    expect(wrapper.text()).toContain('PRD 分析文档');
    expect(wrapper.text()).toContain('Proposal');
    expect(wrapper.text()).not.toContain('OpenSpec Change');
    expect(wrapper.text()).toContain('阻断问题');
    await wrapper.find('.artifact-row').trigger('click');
    expect(wrapper.emitted('select')?.[0][0]).toMatchObject({ path: 'docs/172014/prd/analysis.md' });
  });
});
