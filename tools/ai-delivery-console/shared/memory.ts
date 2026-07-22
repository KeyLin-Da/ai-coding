import type { ActionType, WorkflowStage } from './workflow';

export const memoryTypes = ['TECH_EXPERIENCE', 'BUSINESS_RULE', 'RISK_LESSON', 'TEAM_PREFERENCE', 'TECH_HYPOTHESIS'] as const;
export type MemoryType = (typeof memoryTypes)[number];

export const memoryCandidateStatuses = ['PENDING_CONFIRM', 'PENDING_VERIFY', 'LOCAL_ONLY', 'IGNORED', 'CONFIRMED'] as const;
export type MemoryCandidateStatus = (typeof memoryCandidateStatuses)[number];

export const memoryCardStatuses = ['ACTIVE', 'PENDING_VERIFY', 'STALE', 'REJECTED'] as const;
export type MemoryCardStatus = (typeof memoryCardStatuses)[number];

export const memorySourceTypes = ['ANNOTATION', 'ANNOTATION_REPLY', 'QUESTION', 'CLARIFICATION', 'REVIEW', 'RECALL', 'RETROSPECTIVE', 'MANUAL'] as const;
export type MemorySourceType = (typeof memorySourceTypes)[number];

export const memoryRecallFeedbackStatuses = ['EFFECTIVE', 'PARTIAL', 'UNUSED', 'OUTDATED', 'MISLEADING'] as const;
export type MemoryRecallFeedbackStatus = (typeof memoryRecallFeedbackStatuses)[number];

export const memoryRecallStatuses = [
  'INJECTED',
  'APPLIED',
  'SKIPPED_ALREADY_APPLIED',
  'UPDATED_RECALL',
  'REAPPLIED',
  'FORCE_REAPPLIED',
  'DISMISSED',
  'SKIPPED_NO_MATCH',
  'SKIPPED_USER_DISABLED'
] as const;
export type MemoryRecallStatus = (typeof memoryRecallStatuses)[number];

export const memoryRecallDismissReasons = ['NOISY', 'IRRELEVANT', 'OUTDATED'] as const;
export type MemoryRecallDismissReason = (typeof memoryRecallDismissReasons)[number];

export type MemoryEmbeddingProviderKind = 'none' | 'http' | 'external' | 'local';

export interface MemoryAppliesTo {
  modules: string[];
  stages: WorkflowStage[];
}

export interface MemoryEvidenceRef {
  sourceType: MemorySourceType;
  requirementId: string;
  path?: string;
  quote: string;
  runId?: string;
  artifactPath?: string;
}

export interface MemoryCandidate {
  id: string;
  projectId?: string;
  requirementId: string;
  sourceKey: string;
  sourceType: MemorySourceType;
  sourcePath?: string;
  sourceRunId: string;
  sourceArtifactPath?: string;
  sourceText: string;
  statement: string;
  type: MemoryType;
  status: MemoryCandidateStatus;
  confidence: number;
  tags: string[];
  appliesTo: MemoryAppliesTo;
  evidence: MemoryEvidenceRef[];
  createdAt: string;
  updatedAt: string;
  confirmedMemoryId?: string;
  ignoredReason?: string;
}

export interface MemoryCard {
  id: string;
  projectId?: string;
  statement: string;
  type: MemoryType;
  status: MemoryCardStatus;
  confidence: number;
  tags: string[];
  appliesTo: MemoryAppliesTo;
  evidence: MemoryEvidenceRef[];
  sourceCandidateId?: string;
  contentHash?: string;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCardRevision {
  id: string;
  memoryId: string;
  projectId?: string;
  before: MemoryCard;
  after: MemoryCard;
  changeReason?: string;
  createdAt: string;
}

export interface MemoryRecallRecord {
  id: string;
  projectId?: string;
  requirementId: string;
  actionType: ActionType;
  stage?: WorkflowStage;
  runId: string;
  memoryId: string;
  recallStatus: MemoryRecallStatus;
  injectedPath?: string;
  artifactPath?: string;
  artifactHash?: string;
  memoryContentHash?: string;
  memoryVersion?: string;
  queryProfileHash?: string;
  previewId?: string;
  selectedByUser?: boolean;
  dismissedReason?: MemoryRecallDismissReason;
  scoreBreakdown?: MemoryRecallScoreBreakdown;
  skipReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetrospectiveEvidenceItem {
  id: string;
  sourceType: MemorySourceType;
  requirementId: string;
  path?: string;
  quote?: string;
  runId?: string;
  actor?: string;
  createdAt?: string;
  artifactPath?: string;
}

export interface RetrospectiveEvidenceFile {
  version: 1;
  requirementId: string;
  items: RetrospectiveEvidenceItem[];
}

export interface RetrospectiveMemoryCandidateInput {
  statement: string;
  type: MemoryType;
  confidence?: number;
  tags?: string[];
  appliesTo?: Partial<MemoryAppliesTo>;
  sourceText?: string;
  evidence?: MemoryEvidenceRef[];
}

export interface RetrospectiveMemoryCandidatesFile {
  version: 1;
  requirementId: string;
  items: RetrospectiveMemoryCandidateInput[];
}

export interface MemoryRecallFeedback {
  memoryId: string;
  status: MemoryRecallFeedbackStatus;
  reason?: string;
  evidence?: MemoryEvidenceRef[];
}

export interface MemoryRecallFeedbackFile {
  version: 1;
  requirementId: string;
  items: MemoryRecallFeedback[];
}

export interface RetrospectiveSummary {
  summaryPath?: string;
  evidencePath?: string;
  candidatePath?: string;
  recallFeedbackPath?: string;
  evidenceCount: number;
  candidateCount: number;
  pendingCandidateCount: number;
  recallFeedbackCount: number;
  unresolvedRiskCount: number;
  riskAcceptedAt?: string;
  readyForReview: boolean;
  parseError?: string;
}

export interface MemoryRecallScoreBreakdown {
  scopeMatched: boolean;
  bm25?: number;
  keyword?: number;
  embedding?: number;
  feedback?: number;
  final: number;
}

export interface MemoryQueryProfile {
  requirementId: string;
  actionType: ActionType;
  stage?: WorkflowStage;
  title?: string;
  intentSummary: string;
  modules: string[];
  businessTerms: string[];
  technicalEntities: string[];
  constraints: string[];
  sourceSnippets: string[];
  sourceHash: string;
  queryProfileHash: string;
}

export interface MemoryRecallPreviewItem {
  memoryId: string;
  statement: string;
  type: MemoryType;
  status: MemoryCardStatus;
  confidence: number;
  sourceSummary: string;
  updatedAt: string;
  score: number;
  selectedByDefault: boolean;
  reasons: string[];
  scoreBreakdown: MemoryRecallScoreBreakdown;
  memoryContentHash?: string;
}

export interface MemoryRecallPreviewResult {
  previewId: string;
  queryProfile: MemoryQueryProfile;
  items: MemoryRecallPreviewItem[];
}

export interface MemoryRecallDismissInput {
  memoryId: string;
  reason: MemoryRecallDismissReason;
}

export interface MemoryRecallActionInput {
  enabled: boolean;
  previewId?: string;
  selectedMemoryIds?: string[];
  dismissed?: MemoryRecallDismissInput[];
  force?: boolean;
}

export interface MemoryRecallConfirmInput extends MemoryRecallActionInput {
  actionType: ActionType;
  stage?: WorkflowStage;
  runId: string;
  sourceFilePaths?: string[];
  clarification?: string;
  runIntent?: string;
}

export interface MemorySearchConfig {
  sourceLimits: {
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
    maxBusinessTerms: number;
    maxPhrases: number;
    maxTechnicalEntities: number;
    maxSourceSnippets: number;
  };
  thresholds: {
    minContentScore: number;
    minEmbeddingScore: number;
    selectedByDefaultScore: number;
    maxPreviewItems: number;
    maxInjectedItems: number;
    maxPendingVerifyItems: number;
  };
  weights: {
    bm25: number;
    keyword: number;
    embedding: number;
    feedback: number;
  };
  embedding: {
    enabled: boolean;
    provider: MemoryEmbeddingProviderKind;
    endpoint?: string;
    model: string;
    dimension: number;
    timeoutMs: number;
    batchSize: number;
  };
}

export interface MemoryEmbeddingIndex {
  version: 1;
  model: string;
  dimension: number;
  updatedAt: string;
  items: MemoryEmbeddingItem[];
}

export interface MemoryEmbeddingItem {
  memoryId: string;
  projectId?: string;
  contentHash: string;
  model: string;
  vector: number[];
  updatedAt: string;
}

export interface MemoryCandidateFilter {
  projectId?: string;
  requirementId?: string;
  status?: MemoryCandidateStatus | MemoryCandidateStatus[];
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface MemoryCardFilter {
  projectId?: string;
  status?: MemoryCardStatus | MemoryCardStatus[];
  type?: MemoryType;
  keyword?: string;
  module?: string;
  stage?: WorkflowStage;
  page?: number;
  pageSize?: number;
}

export interface MemoryRecallFilter {
  projectId?: string;
  requirementId?: string;
  memoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface MemoryPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemoryCandidateConfirmInput {
  statement?: string;
  type?: MemoryType;
  tags?: string[];
  appliesTo?: Partial<MemoryAppliesTo>;
  status?: 'ACTIVE' | 'PENDING_VERIFY';
}

export interface MemoryCandidateUpdateInput {
  statement?: string;
  type?: MemoryType;
  tags?: string[];
  appliesTo?: Partial<MemoryAppliesTo>;
  sourceText?: string;
  confidence?: number;
}

export interface MemoryCardCreateInput {
  projectId?: string;
  requirementId?: string;
  statement: string;
  type: MemoryType;
  status?: 'ACTIVE' | 'PENDING_VERIFY';
  confidence?: number;
  tags?: string[];
  appliesTo?: Partial<MemoryAppliesTo>;
  evidenceQuote?: string;
}

export interface MemoryCardUpdateInput {
  statement?: string;
  type?: MemoryType;
  status?: MemoryCardStatus;
  confidence?: number;
  tags?: string[];
  appliesTo?: Partial<MemoryAppliesTo>;
  evidenceQuote?: string;
  changeReason?: string;
}
