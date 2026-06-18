import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessage } from 'element-plus';
import { createEmptyStages, type RequirementWorkflow } from '../../shared/workflow';
import { useWorkflowStore } from '@/stores/workflow';
import { apiClient } from '@/api/client';

vi.mock('element-plus', () => ({
  ElMessage: {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
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

  it('项目仓拉取通知仍提示用户手动同步', () => {
    const store = useWorkflowStore();

    store.applyRealtimeHint({
      projectId: 1,
      eventId: 13,
      eventType: 'project.repo.pull-required',
      aggregateType: 'PROJECT_REPO',
      aggregateId: 5,
      payloadJson: '{}'
    });

    expect(ElMessage.warning).toHaveBeenCalledWith('项目产物仓有新提交，请点击右上角“同步 Git 仓”后继续操作');
  });

  it('项目仓状态事件不触发需求详情和列表刷新', async () => {
    const store = useWorkflowStore();
    store.requirements = [workflow()];
    store.current = workflow();
    const loadRequirement = vi.spyOn(store, 'loadRequirement').mockImplementation(async () => undefined);
    const loadRequirements = vi.spyOn(store, 'loadRequirements').mockImplementation(async () => undefined);

    await store.handleRealtimeDomainEvent({
      projectId: 1,
      eventId: 14,
      eventType: 'project.repo.state-changed',
      aggregateType: 'PROJECT_REPO',
      aggregateId: 5,
      payloadJson: '{"syncStatus":"DIRTY"}'
    });

    expect(loadRequirement).not.toHaveBeenCalled();
    expect(loadRequirements).not.toHaveBeenCalled();
    expect(ElMessage.info).not.toHaveBeenCalledWith('项目产物仓状态：DIRTY');
  });

  it('需求工作区状态事件不触发需求详情和列表刷新', async () => {
    const store = useWorkflowStore();
    store.requirements = [workflow()];
    store.current = workflow();
    const loadRequirement = vi.spyOn(store, 'loadRequirement').mockImplementation(async () => undefined);
    const loadRequirements = vi.spyOn(store, 'loadRequirements').mockImplementation(async () => undefined);

    await store.handleRealtimeDomainEvent({
      projectId: 1,
      eventId: 15,
      eventType: 'requirement.workspace-state.updated',
      aggregateType: 'REQUIREMENT',
      aggregateId: 100,
      payloadJson: '{"requirementPk":100,"status":"DIRTY","userDisplayName":"林达键"}'
    });

    expect(loadRequirement).not.toHaveBeenCalled();
    expect(loadRequirements).not.toHaveBeenCalled();
  });

  it('技术方案批注事件只分发局部刷新事件', async () => {
    const store = useWorkflowStore();
    store.requirements = [workflow()];
    store.current = workflow();
    const loadRequirement = vi.spyOn(store, 'loadRequirement').mockImplementation(async () => undefined);
    const loadRequirements = vi.spyOn(store, 'loadRequirements').mockImplementation(async () => undefined);
    const annotationChanged = vi.fn();
    window.addEventListener('ai-delivery:tech-design-annotation-changed', annotationChanged);

    await store.handleRealtimeDomainEvent({
      projectId: 1,
      eventId: 17,
      eventType: 'tech-design.annotation.changed',
      aggregateType: 'REQUIREMENT',
      aggregateId: 100,
      payloadJson: '{"requirementPk":100,"requirementId":"172014","annotationId":"annotation-1","operation":"CREATED"}'
    });

    expect(annotationChanged).toHaveBeenCalledTimes(1);
    expect((annotationChanged.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      requirementId: '172014',
      annotationId: 'annotation-1',
      operation: 'CREATED'
    });
    expect(loadRequirement).not.toHaveBeenCalled();
    expect(loadRequirements).not.toHaveBeenCalled();
    window.removeEventListener('ai-delivery:tech-design-annotation-changed', annotationChanged);
  });

  it('Git 同步完成事件仍会刷新当前需求和列表', async () => {
    const store = useWorkflowStore();
    store.requirements = [workflow()];
    store.current = workflow();
    const loadRequirement = vi.spyOn(store, 'loadRequirement').mockImplementation(async () => undefined);
    const loadRequirements = vi.spyOn(store, 'loadRequirements').mockImplementation(async () => undefined);

    await store.handleRealtimeDomainEvent({
      projectId: 1,
      eventId: 16,
      eventType: 'artifact.git-sync.completed',
      aggregateType: 'ARTIFACT_SYNC',
      aggregateId: 50,
      payloadJson: '{"requirementPk":100,"commitSha":"abcdef1"}'
    });

    expect(loadRequirement).toHaveBeenCalledWith('172014');
    expect(loadRequirements).toHaveBeenCalledTimes(1);
    expect(ElMessage.success).toHaveBeenCalledWith('产物已推送：abcdef1');
  });

  it('运行日志实时订阅走中心 WebSocket 客户端，不再创建本地 SSE', async () => {
    const store = useWorkflowStore();
    store.current = workflow();
    store.runEventSeqs['100'] = 2;
    const subscribeRun = vi.fn().mockResolvedValue(undefined);
    store.ensureRealtimeClient = vi.fn().mockResolvedValue({ subscribeRun } as any);
    const eventSource = vi.fn();
    vi.stubGlobal('EventSource', eventSource);

    store.streamRunEvents('100');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(subscribeRun).toHaveBeenCalledWith('100', 2);
    expect(eventSource).not.toHaveBeenCalled();
  });

  it('本地 Runner 字符串 runId 的实时日志走本地 SSE', () => {
    const store = useWorkflowStore();
    store.current = workflow();
    const source = {
      close: vi.fn(),
      onmessage: undefined as ((event: MessageEvent) => void) | undefined,
      onerror: undefined as (() => void) | undefined
    } as unknown as EventSource;
    const openRunEventStream = vi.spyOn(apiClient, 'openRunEventStream').mockReturnValue(source);
    const ensureRealtimeClient = vi.spyOn(store, 'ensureRealtimeClient');

    store.streamRunEvents('run-20260617110658-10d25f');

    expect(openRunEventStream).toHaveBeenCalledWith('172014', 'run-20260617110658-10d25f');
    expect(ensureRealtimeClient).not.toHaveBeenCalled();
    expect(store.runEventSource).toBeTruthy();
  });
});
