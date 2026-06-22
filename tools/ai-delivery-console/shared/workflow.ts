export const workflowStages = ['PRD', 'TECH_DESIGN', 'IMPLEMENTATION', 'CODE_REVIEW'] as const;

export type WorkflowStage = (typeof workflowStages)[number];

export type WorkflowStatus =
  | 'NOT_STARTED'
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'DONE';

export type RunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'TERMINAL_OPENED'
  | 'SUCCEEDED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'WAITING_FOR_AGENT';

export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'RISK_ACCEPTED';

export type RequirementType = 'REQUIREMENT' | 'DEFECT';

export type ExecutionMode = 'BACKGROUND' | 'TERMINAL' | 'INTERACTIVE_TERMINAL' | 'MANUAL_COPY';

export const implementationSteps = ['START_CHANGE', 'ARTIFACT_REVIEW', 'APPLY', 'CHANGE_INSPECTION'] as const;

export type ImplementationStep = (typeof implementationSteps)[number];
export type LegacyImplementationStep = 'UNIT_TEST';
export type WorkflowImplementationStep = ImplementationStep | LegacyImplementationStep;

export type ActionType =
  | 'PRD_ANALYZE'
  | 'PRD_CLARIFY'
  | 'DESIGN_GENERATE'
  | 'DESIGN_QUESTION'
  | 'OPENSPEC_STATUS'
  | 'OPENSPEC_NEW_CHANGE'
  | 'OPENSPEC_INSTRUCTIONS'
  | 'OPENSPEC_FF'
  | 'OPENSPEC_APPLY'
  | 'OPENSPEC_VERIFY'
  | 'OPENSPEC_ARCHIVE'
  | 'JUNIT_GENERATE'
  | 'CODE_REVIEW'
  | 'RETURN_TO_IMPLEMENTATION'
  | 'REFRESH_ARTIFACTS';

export interface ArtifactRef {
  id: string;
  stage: WorkflowStage;
  label: string;
  path: string;
  kind: 'markdown' | 'html' | 'json' | 'directory' | 'image' | 'text';
  exists: boolean;
  hash?: string;
  updatedAt?: string;
  summary?: string;
  artifactId?: string | number;
  currentVersionId?: string | number;
  currentVersionNo?: number;
  versionCount?: number;
  createdBy?: string | number;
  sourceRunId?: string | number;
  baseVersionId?: string | number;
}

export interface ReviewIssue {
  id: string;
  stage: WorkflowStage;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  title: string;
  sourcePath?: string;
  status: 'OPEN' | 'FIXED' | 'ACCEPTED' | 'INVALID';
  recommendation?: string;
}

export interface ReviewRecord {
  id: string;
  stage: WorkflowStage;
  implementationStep?: WorkflowImplementationStep;
  decision: ReviewDecision;
  comment: string;
  actor: string;
  artifactPath?: string;
  artifactHash?: string;
  createdAt: string;
}

export interface RunEvent {
  time: string;
  type?: 'START' | 'STDOUT' | 'STDERR' | 'INFO' | 'WARN' | 'ERROR' | 'ARTIFACT' | 'EXIT' | 'CANCELLED';
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  text?: string;
  agentId?: string;
  data?: unknown;
}

export interface RunRecord {
  id: string;
  requirementId: string;
  actionType: ActionType;
  stage?: WorkflowStage;
  implementationStep?: WorkflowImplementationStep;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  params: Record<string, unknown>;
  commandText?: string;
  agentId?: string;
  executionMode?: ExecutionMode;
  pid?: number;
  promptPath?: string;
  outputPath?: string;
  terminalScriptPath?: string;
  terminalTranscriptPath?: string;
  terminalStatusPath?: string;
  centerJobId?: number;
  centerRunId?: number;
  codexSessionId?: string;
  codexSessionPath?: string;
  codexSessionOffset?: number;
  codexSessionModel?: string;
  codexTokenSnapshot?: TokenUsageSnapshot;
  tokenUsageOutboxPath?: string;
  centerSyncedAt?: string;
  error?: string;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface TokenUsageSummary {
  runId?: string | number;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  runCount: number;
  detailCount: number;
  latestOccurredAt?: string;
}

export interface RunTokenUsageDetail {
  id?: string | number;
  runId: string | number;
  requirementPk?: string | number;
  jobId?: string | number;
  clientSessionId?: string | number;
  agentId?: string;
  stage?: WorkflowStage;
  implementationStep?: WorkflowImplementationStep;
  model?: string;
  sourceEventType: string;
  usageFingerprint?: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  rawUsageJson?: string;
  occurredAt?: string;
  createdAt?: string;
}

export interface RunTokenUsageRun {
  runId: string | number;
  summary: TokenUsageSummary;
  details: RunTokenUsageDetail[];
}

export interface RequirementTokenUsagePage {
  requirementPk: string | number;
  page: number;
  pageSize: number;
  total: number;
  items: RunTokenUsageDetail[];
}

export interface TokenUsageBucket {
  bucketType: 'stage' | 'agent' | string;
  bucketKey: string;
  summary: TokenUsageSummary;
}

export interface RequirementTokenUsageSummary {
  requirementPk?: string | number;
  summary: TokenUsageSummary;
  latestRunSummary: TokenUsageSummary;
  stageSummaries: TokenUsageBucket[];
  agentSummaries: TokenUsageBucket[];
}

export function emptyTokenUsageSummary(runId?: string | number): TokenUsageSummary {
  return {
    runId,
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    runCount: 0,
    detailCount: 0
  };
}

export function emptyRunTokenUsage(runId: string | number): RunTokenUsageRun {
  return {
    runId,
    summary: emptyTokenUsageSummary(runId),
    details: []
  };
}

export function emptyRequirementTokenUsage(requirementPk?: string | number): RequirementTokenUsageSummary {
  return {
    requirementPk,
    summary: emptyTokenUsageSummary(),
    latestRunSummary: emptyTokenUsageSummary(),
    stageSummaries: [],
    agentSummaries: []
  };
}

export interface PrdSourceFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType?: string;
  uploadedAt: string;
}

export type TechDesignSourceFile = PrdSourceFile;

export type TechDesignInputLedgerEntryType = 'QUESTION' | 'SOURCE_FILE' | 'CLARIFICATION';

export interface TechDesignInputLedgerEntry {
  id: string;
  type: TechDesignInputLedgerEntryType;
  path?: string;
  contentHash?: string;
  consumedAt: string;
  consumedRunId: string;
}

export interface TechDesignInputLedger {
  version: 1;
  entries: TechDesignInputLedgerEntry[];
}

export type TechDesignVersionSource = 'PUBLISHED' | 'DRAFT_SNAPSHOT' | 'CURRENT_DRAFT';

export interface TechDesignVersion {
  id: string;
  source: TechDesignVersionSource;
  label: string;
  artifactPath: string;
  contentHash?: string;
  versionNo?: number;
  commitSha?: string;
  createdAt?: string;
  createdBy?: string | number;
  sourceRunId?: string | number;
  readable: boolean;
  unreadableReason?: string;
}

export interface TechDesignVersionContent {
  version: TechDesignVersion;
  content: string;
}

export interface TechDesignVersionDiffInput {
  leftVersionId: string;
  rightVersionId: string;
}

export interface TechDesignVersionDiff {
  left: TechDesignVersion;
  right: TechDesignVersion;
  diff: string;
  truncated: boolean;
}

export type TechDesignAnnotationStatus = 'OPEN' | 'RESOLVED' | 'CARRIED_FORWARD' | 'STALE';

export interface TechDesignAnnotationAnchor {
  plainStart: number;
  plainEnd: number;
  prefixText: string;
  suffixText: string;
  headingPath: string[];
  occurrence: number;
}

export interface TechDesignAnnotationReply {
  id: string;
  annotationId: string;
  content: string;
  consumedAt?: string;
  consumedRunId?: string;
  createdBy?: string | number;
  createdByName?: string;
  updatedBy?: string | number;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TechDesignAnnotation {
  id: string;
  requirementId: string;
  artifactPath: string;
  versionId: string;
  versionNo?: number;
  versionSource: TechDesignVersionSource;
  contentHash: string;
  selectedText: string;
  anchor: TechDesignAnnotationAnchor;
  comment: string;
  status: TechDesignAnnotationStatus;
  includeInNextGeneration: boolean;
  consumedAt?: string;
  consumedRunId?: string;
  createdBy?: string | number;
  createdByName?: string;
  updatedBy?: string | number;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
  replies?: TechDesignAnnotationReply[];
}

export interface TechDesignAnnotationCreateInput {
  versionId: string;
  selectedText: string;
  anchor: TechDesignAnnotationAnchor;
  comment: string;
  includeInNextGeneration?: boolean;
}

export interface TechDesignAnnotationStatusInput {
  status?: TechDesignAnnotationStatus;
  includeInNextGeneration?: boolean;
}

export interface TechDesignAnnotationDeleteInput {
  expectedHash?: string;
}

export interface TechDesignAnnotationReplyCreateInput {
  content: string;
  expectedHash?: string;
}

export interface TechDesignAnnotationList {
  annotations: TechDesignAnnotation[];
  hash: string;
  summaryPath: string;
}

export interface WorkflowProject {
  name: string;
  path: string;
}

export type OpenSpecArtifactType = 'proposal' | 'design' | 'tasks' | 'spec';

export interface OpenSpecArtifactRef {
  id: string;
  type: OpenSpecArtifactType;
  label: string;
  path: string;
  exists: boolean;
}

export interface OpenSpecTaskItem {
  id?: string;
  title: string;
  completed: boolean;
  line: number;
  raw: string;
}

export interface OpenSpecTaskGroup {
  title: string;
  items: OpenSpecTaskItem[];
}

export interface OpenSpecTaskSummary {
  total: number;
  completed: number;
  groups: OpenSpecTaskGroup[];
}

export interface OpenSpecSummary {
  changeName: string;
  rootPath: string;
  exists: boolean;
  archived: boolean;
  archivePath?: string;
  artifacts: OpenSpecArtifactRef[];
  specs: OpenSpecArtifactRef[];
  tasks: OpenSpecTaskSummary;
}

export interface GitChangedFile {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  additions?: number;
  deletions?: number;
}

export interface GitProjectChangeSummary {
  project: WorkflowProject;
  currentBranch?: string;
  expectedBranch?: string;
  branchMatches: boolean;
  files: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  stagedDiff: string;
  unstagedDiff: string;
  diff: string;
  additions: number;
  deletions: number;
  error?: string;
}

export interface GitChangeSummary {
  updatedAt: string;
  files: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  diff: string;
  projects: GitProjectChangeSummary[];
  additions: number;
  deletions: number;
}

export interface GitStageUntrackedInput {
  projectPath: string;
  files: string[];
}

export type AgentInputMode = 'PROMPT_FILE' | 'STDIN' | 'ARGUMENTS' | 'MANUAL';

export interface AgentProvider {
  id: string;
  name: string;
  description?: string;
  inputMode: AgentInputMode;
  command?: string[];
  interactiveCommand?: string[];
  available: boolean;
  supportsStreaming: boolean;
  supportsInteractive?: boolean;
}

export interface StageState {
  stage: WorkflowStage;
  status: WorkflowStatus;
  artifactPath?: string;
  changeName?: string;
  runId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  comment?: string;
}

export interface ImplementationStepState {
  step: WorkflowImplementationStep;
  status: WorkflowStatus;
  runId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  comment?: string;
}

export interface RequirementWorkflow {
  id?: string | number;
  requirementId: string;
  title: string;
  requirementType?: RequirementType;
  branchName?: string;
  projects?: WorkflowProject[];
  prdClarification?: string;
  techDesignDocument?: string;
  techDesignClarification?: string;
  techDesignConsumedQuestionPaths?: string[];
  prdSourceFiles?: PrdSourceFile[];
  techDesignSourceFiles?: TechDesignSourceFile[];
  sources: string[];
  currentStage: WorkflowStage | 'DONE';
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  stages: Record<WorkflowStage, StageState>;
  implementationSteps?: Partial<Record<WorkflowImplementationStep, ImplementationStepState>>;
  artifacts: ArtifactRef[];
  runs: RunRecord[];
  reviews: ReviewRecord[];
  issues: ReviewIssue[];
  onlineClientCount?: number;
  pendingReviewCount?: number;
  jobStatus?: string;
  lastEventId?: string | number;
}

export interface RequirementInput {
  id?: string | number;
  requirementId: string;
  title?: string;
  requirementType?: RequirementType;
  branchName?: string;
  projects?: WorkflowProject[];
  prdClarification?: string;
  techDesignDocument?: string;
  techDesignClarification?: string;
  techDesignConsumedQuestionPaths?: string[];
  techDesignSourceFiles?: TechDesignSourceFile[];
  sources?: string[];
}

export interface ActionInput {
  actionType: ActionType;
  params?: Record<string, unknown>;
}

export interface ReviewInput {
  requirementId: string;
  stage: WorkflowStage;
  implementationStep?: WorkflowImplementationStep;
  decision: ReviewDecision;
  comment: string;
  actor?: string;
  artifactPath?: string;
}

export const stageLabels: Record<WorkflowStage, string> = {
  PRD: 'PRD',
  TECH_DESIGN: '技术方案',
  IMPLEMENTATION: '实施验证',
  CODE_REVIEW: '代码评审'
};

export const requirementTypeLabels: Record<RequirementType, string> = {
  REQUIREMENT: '需求',
  DEFECT: '缺陷'
};

export const statusLabels: Record<WorkflowStatus | RunStatus, string> = {
  NOT_STARTED: '未开始',
  DRAFT: '草稿',
  READY_FOR_REVIEW: '待审核',
  APPROVED: '已通过',
  REJECTED: '已打回',
  IN_PROGRESS: '进行中',
  IN_REVIEW: '审核中',
  BLOCKED: '阻塞',
  SKIPPED: '已跳过',
  DONE: '完成',
  QUEUED: '排队中',
  RUNNING: '运行中',
  TERMINAL_OPENED: '终端已打开',
  SUCCEEDED: '成功',
  COMPLETED: '已完成',
  FAILED: '失败',
  WAITING_FOR_AGENT: '等待 Agent',
  CANCELLED: '已取消'
};

export const actionTypeLabels: Record<ActionType, string> = {
  PRD_ANALYZE: 'PRD 分析',
  PRD_CLARIFY: 'PRD 澄清',
  DESIGN_GENERATE: '技术方案生成',
  DESIGN_QUESTION: '技术方案答疑',
  OPENSPEC_STATUS: 'OpenSpec 状态检查',
  OPENSPEC_NEW_CHANGE: '创建 OpenSpec 变更',
  OPENSPEC_INSTRUCTIONS: '读取 OpenSpec 指令',
  OPENSPEC_FF: 'OpenSpec 快速生成',
  OPENSPEC_APPLY: '应用 OpenSpec 变更',
  OPENSPEC_VERIFY: '验证 OpenSpec 变更',
  OPENSPEC_ARCHIVE: '归档 OpenSpec 变更',
  JUNIT_GENERATE: '单元测试生成',
  CODE_REVIEW: '代码评审',
  RETURN_TO_IMPLEMENTATION: '打回实施',
  REFRESH_ARTIFACTS: '刷新产物'
};

export const implementationStepLabels: Record<ImplementationStep, string> = {
  START_CHANGE: '开始变更',
  ARTIFACT_REVIEW: '工件生成与评审',
  APPLY: '开始实施',
  CHANGE_INSPECTION: '查看变更文件及代码'
};

export function createEmptyStages(requirementType: RequirementType = 'REQUIREMENT'): Record<WorkflowStage, StageState> {
  const stages: Record<WorkflowStage, StageState> = {
    PRD: { stage: 'PRD', status: 'DRAFT' },
    TECH_DESIGN: { stage: 'TECH_DESIGN', status: 'NOT_STARTED' },
    IMPLEMENTATION: { stage: 'IMPLEMENTATION', status: 'NOT_STARTED' },
    CODE_REVIEW: { stage: 'CODE_REVIEW', status: 'NOT_STARTED' }
  };
  if (requirementType === 'DEFECT') {
    stages.PRD.status = 'SKIPPED';
    stages.TECH_DESIGN.status = 'DRAFT';
  }
  return stages;
}

export function workflowStagesForType(requirementType: RequirementType = 'REQUIREMENT'): WorkflowStage[] {
  if (requirementType === 'DEFECT') {
    return ['TECH_DESIGN', 'IMPLEMENTATION', 'CODE_REVIEW'];
  }
  return [...workflowStages];
}

export function workflowStagesForWorkflow(workflow?: Pick<RequirementWorkflow, 'requirementType'>): WorkflowStage[] {
  return workflowStagesForType(workflow?.requirementType || 'REQUIREMENT');
}

export function isStageApplicableToType(stage: WorkflowStage, requirementType: RequirementType = 'REQUIREMENT'): boolean {
  return workflowStagesForType(requirementType).includes(stage);
}

export function isStageApplicableToWorkflow(stage: WorkflowStage, workflow?: Pick<RequirementWorkflow, 'requirementType'>): boolean {
  return workflowStagesForWorkflow(workflow).includes(stage);
}

export function createEmptyImplementationSteps(): Record<ImplementationStep, ImplementationStepState> {
  return {
    START_CHANGE: { step: 'START_CHANGE', status: 'DRAFT' },
    ARTIFACT_REVIEW: { step: 'ARTIFACT_REVIEW', status: 'NOT_STARTED' },
    APPLY: { step: 'APPLY', status: 'NOT_STARTED' },
    CHANGE_INSPECTION: { step: 'CHANGE_INSPECTION', status: 'NOT_STARTED' }
  };
}

export function ensureImplementationSteps(
  steps?: Partial<Record<WorkflowImplementationStep, Partial<ImplementationStepState>>>
): Record<ImplementationStep, ImplementationStepState> {
  const defaults = createEmptyImplementationSteps();
  for (const step of implementationSteps) {
    defaults[step] = {
      ...defaults[step],
      ...(steps?.[step] || {}),
      step
    };
  }
  return defaults;
}

export function isImplementationStep(step?: WorkflowImplementationStep): step is ImplementationStep {
  return implementationSteps.includes(step as ImplementationStep);
}

export function findFirstPendingImplementationStep(
  steps?: Partial<Record<WorkflowImplementationStep, Partial<ImplementationStepState>>>
): ImplementationStep {
  const normalized = ensureImplementationSteps(steps);
  const firstPending = implementationSteps.find((step) => normalized[step].status !== 'APPROVED');
  return firstPending || implementationSteps[implementationSteps.length - 1];
}

export const actionStageMap: Partial<Record<ActionType, WorkflowStage>> = {
  PRD_ANALYZE: 'PRD',
  PRD_CLARIFY: 'PRD',
  DESIGN_GENERATE: 'TECH_DESIGN',
  DESIGN_QUESTION: 'TECH_DESIGN',
  OPENSPEC_STATUS: 'IMPLEMENTATION',
  OPENSPEC_NEW_CHANGE: 'IMPLEMENTATION',
  OPENSPEC_INSTRUCTIONS: 'IMPLEMENTATION',
  OPENSPEC_FF: 'IMPLEMENTATION',
  OPENSPEC_APPLY: 'IMPLEMENTATION',
  OPENSPEC_VERIFY: 'IMPLEMENTATION',
  OPENSPEC_ARCHIVE: 'CODE_REVIEW',
  JUNIT_GENERATE: 'IMPLEMENTATION',
  CODE_REVIEW: 'CODE_REVIEW',
  RETURN_TO_IMPLEMENTATION: 'CODE_REVIEW'
};

export const actionImplementationStepMap: Partial<Record<ActionType, ImplementationStep>> = {
  OPENSPEC_STATUS: 'ARTIFACT_REVIEW',
  OPENSPEC_NEW_CHANGE: 'START_CHANGE',
  OPENSPEC_INSTRUCTIONS: 'ARTIFACT_REVIEW',
  OPENSPEC_FF: 'ARTIFACT_REVIEW',
  OPENSPEC_APPLY: 'APPLY',
  OPENSPEC_VERIFY: 'APPLY'
};

export function stageForAction(actionType: ActionType): WorkflowStage | undefined {
  return actionStageMap[actionType];
}

export function implementationStepForAction(actionType: ActionType): ImplementationStep | undefined {
  return actionImplementationStepMap[actionType];
}

export function nextImplementationStep(step: ImplementationStep): ImplementationStep | undefined {
  const index = implementationSteps.indexOf(step);
  return index >= 0 ? implementationSteps[index + 1] : undefined;
}

export function defaultBranchName(requirementId: string, requirementType: RequirementType = 'REQUIREMENT'): string {
  const prefix = requirementType === 'DEFECT' ? 'bugfix' : 'feature';
  return `${prefix}/opp#${requirementId}`;
}

export function shouldSyncBranchName(
  currentBranchName: string | undefined,
  previousAutoBranchName: string | undefined,
  hasManualBranchName: boolean
): boolean {
  const current = (currentBranchName || '').trim();
  const previousAuto = (previousAutoBranchName || '').trim();
  return !hasManualBranchName || !current || current === previousAuto;
}
