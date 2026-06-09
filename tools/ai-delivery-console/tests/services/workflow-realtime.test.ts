import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessage } from 'element-plus';
import { createEmptyStages, type RequirementWorkflow } from '../../shared/workflow';
import { useWorkflowStore } from '@/stores/workflow';

vi.mock('element-plus', () => ({
  ElMessage: {
    info: vi.fn(),
    warning: vi.fn()
  }
}));

function workflow(): RequirementWorkflow {
  return {
    id: 100,
    requirementId: '172014',
    title: 'WebSocket 协作',
    requirementType: 'REQUIREMENT',
    sources: [],
    currentStage: 'TECH_DESIGN',
    status: 'IN_PROGRESS',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    stages: createEmptyStages(),
    artifacts: [],
    runs: [],
    reviews: [],
    issues: []
  };
}

describe('workflow realtime hints', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('执行占用事件会更新列表和详情状态', () => {
    const store = useWorkflowStore();
    store.requirements = [workflow()];
    store.current = workflow();

    store.applyRealtimeHint({
      projectId: 1,
      eventId: 10,
      eventType: 'execution.lock.updated',
      aggregateType: 'EXECUTION_LOCK',
      aggregateId: 20,
      payloadJson: '{"requirementPk":100,"stage":"TECH_DESIGN","actionType":"DESIGN_GENERATE","status":"ACTIVE"}'
    });

    expect(store.requirements[0].jobStatus).toBe('TECH_DESIGN 执行中');
    expect(store.current?.jobStatus).toBe('TECH_DESIGN 执行中');
  });

  it('产物发布事件会提示用户刷新结果', () => {
    const store = useWorkflowStore();

    store.applyRealtimeHint({
      projectId: 1,
      eventId: 11,
      eventType: 'artifact.version.created',
      aggregateType: 'ARTIFACT',
      aggregateId: 30,
      payloadJson: '{"requirementPk":100,"artifactId":30,"versionId":40}'
    });

    expect(ElMessage.info).toHaveBeenCalledWith('检测到新产物版本，已刷新');
  });

  it('需求工作区状态事件不弹全局正在编辑提示', () => {
    const store = useWorkflowStore();

    store.applyRealtimeHint({
      projectId: 1,
      eventId: 12,
      eventType: 'requirement.workspace-state.updated',
      aggregateType: 'REQUIREMENT',
      aggregateId: 100,
      payloadJson: '{"requirementPk":100,"status":"DIRTY","userDisplayName":"林达键"}'
    });

    expect(ElMessage.warning).not.toHaveBeenCalledWith('林达键 正在编辑当前需求');
  });
});
