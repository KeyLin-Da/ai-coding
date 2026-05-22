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
  | 'DONE';

export type RunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'TERMINAL_OPENED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'WAITING_FOR_AGENT';

export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'RISK_ACCEPTED';

export type RequirementType = 'REQUIREMENT' | 'DEFECT';

export type ExecutionMode = 'BACKGROUND' | 'TERMINAL';

export type ActionType =
  | 'PRD_ANALYZE'
  | 'DESIGN_GENERATE'
  | 'OPENSPEC_STATUS'
  | 'OPENSPEC_NEW_CHANGE'
  | 'OPENSPEC_INSTRUCTIONS'
  | 'OPENSPEC_FF'
  | 'OPENSPEC_APPLY'
  | 'OPENSPEC_VERIFY'
  | 'JUNIT_GENERATE'
  | 'CODE_REVIEW'
  | 'RETURN_TO_IMPLEMENTATION'
  | 'REFRESH_ARTIFACTS';

export interface ArtifactRef {
  id: string;
  stage: WorkflowStage;
  label: string;
  path: string;
  kind: 'markdown' | 'html' | 'json' | 'directory' | 'text';
  exists: boolean;
  hash?: string;
  updatedAt?: string;
  summary?: string;
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
  error?: string;
}

export interface PrdSourceFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType?: string;
  uploadedAt: string;
}

export type AgentInputMode = 'PROMPT_FILE' | 'STDIN' | 'ARGUMENTS' | 'MANUAL';

export interface AgentProvider {
  id: string;
  name: string;
  description?: string;
  inputMode: AgentInputMode;
  command?: string[];
  available: boolean;
  supportsStreaming: boolean;
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

export interface RequirementWorkflow {
  requirementId: string;
  title: string;
  requirementType?: RequirementType;
  branchName?: string;
  prdClarification?: string;
  techDesignDocument?: string;
  techDesignClarification?: string;
  prdSourceFiles?: PrdSourceFile[];
  sources: string[];
  currentStage: WorkflowStage | 'DONE';
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  stages: Record<WorkflowStage, StageState>;
  artifacts: ArtifactRef[];
  runs: RunRecord[];
  reviews: ReviewRecord[];
  issues: ReviewIssue[];
}

export interface RequirementInput {
  requirementId: string;
  title?: string;
  requirementType?: RequirementType;
  branchName?: string;
  prdClarification?: string;
  techDesignDocument?: string;
  techDesignClarification?: string;
  sources?: string[];
}

export interface ActionInput {
  actionType: ActionType;
  params?: Record<string, unknown>;
}

export interface ReviewInput {
  requirementId: string;
  stage: WorkflowStage;
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
  DONE: '完成',
  QUEUED: '排队中',
  RUNNING: '运行中',
  TERMINAL_OPENED: '终端已打开',
  SUCCEEDED: '成功',
  FAILED: '失败',
  WAITING_FOR_AGENT: '等待 Agent',
  CANCELLED: '已取消'
};

export function createEmptyStages(): Record<WorkflowStage, StageState> {
  return {
    PRD: { stage: 'PRD', status: 'DRAFT' },
    TECH_DESIGN: { stage: 'TECH_DESIGN', status: 'NOT_STARTED' },
    IMPLEMENTATION: { stage: 'IMPLEMENTATION', status: 'NOT_STARTED' },
    CODE_REVIEW: { stage: 'CODE_REVIEW', status: 'NOT_STARTED' }
  };
}

export const actionStageMap: Partial<Record<ActionType, WorkflowStage>> = {
  PRD_ANALYZE: 'PRD',
  DESIGN_GENERATE: 'TECH_DESIGN',
  OPENSPEC_STATUS: 'IMPLEMENTATION',
  OPENSPEC_NEW_CHANGE: 'IMPLEMENTATION',
  OPENSPEC_INSTRUCTIONS: 'IMPLEMENTATION',
  OPENSPEC_FF: 'IMPLEMENTATION',
  OPENSPEC_APPLY: 'IMPLEMENTATION',
  OPENSPEC_VERIFY: 'IMPLEMENTATION',
  JUNIT_GENERATE: 'IMPLEMENTATION',
  CODE_REVIEW: 'CODE_REVIEW',
  RETURN_TO_IMPLEMENTATION: 'CODE_REVIEW'
};

export function stageForAction(actionType: ActionType): WorkflowStage | undefined {
  return actionStageMap[actionType];
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
