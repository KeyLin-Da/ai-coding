import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactRef, RequirementWorkflow, ReviewIssue, ReviewRecord, RunRecord, RunEvent, WorkflowStage } from '../../shared/workflow';
import { createEmptyStages } from '../../shared/workflow';
import { hashContent, normalizeRequirementId, sanitizeBranchName } from './workspace';
import { scanRequirementArtifacts } from './workspace-scanner';
import type { LocalRequestContext } from './local-request-context';
import { confirmArtifactGitSync } from './artifact-git-sync';
import { resolveProjectRepoPath, runGit, syncProjectRepository } from './project-repository';
import { isReportRunLogPath } from './artifact-path-rules';

export type BootstrapImportStatus = 'PENDING' | 'IMPORTED' | 'DUPLICATED' | 'CONFLICTED' | 'SKIPPED' | 'FAILED' | 'COMPLETED';

export interface BootstrapImportArtifact {
  sourceKey: string;
  requirementId: string;
  logicalPath: string;
  label: string;
  kind: string;
  stage: WorkflowStage;
  sha256: string;
  size: number;
  contentType: string;
  absolutePath: string;
}

export interface BootstrapImportRequirement {
  requirementId: string;
  title: string;
  requirementType: RequirementWorkflow['requirementType'];
  branchName?: string;
  currentStage: RequirementWorkflow['currentStage'];
  status: RequirementWorkflow['status'];
  stages: RequirementWorkflow['stages'];
  runs: RunRecord[];
  reviews: ReviewRecord[];
  issues: ReviewIssue[];
  artifacts: BootstrapImportArtifact[];
}

export interface BootstrapImportPlan {
  workspaceRoot: string;
  manifestSha256: string;
  requirements: BootstrapImportRequirement[];
  skippedArtifacts: string[];
  conflicts: string[];
  estimatedUploadBytes: number;
}

export interface BootstrapManifestItem {
  sourceKey: string;
  status: BootstrapImportStatus;
  targetId?: number | string;
  artifactId?: number | string;
  versionId?: number | string;
  message?: string;
}

export interface BootstrapImportManifest {
  manifestSha256: string;
  importSessionId?: number | string;
  items: Record<string, BootstrapManifestItem>;
  updatedAt: string;
}

export interface BootstrapImportConfig {
  centerBaseUrl: string;
  userId?: string | number;
  projectId: string | number;
  clientSessionId?: string | number;
  workspaceRoot: string;
  dryRun?: boolean;
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export interface BootstrapImportResult {
  importSessionId?: number | string;
  importedArtifacts: number;
  duplicatedArtifacts: number;
  failedArtifacts: number;
  skippedArtifacts: number;
  syncedCommits: string[];
  manifestPath: string;
}

const MANIFEST_PATH = path.join('.ai-delivery', 'import-manifest.json');

export async function buildBootstrapImportPlan(workspaceRoot: string): Promise<BootstrapImportPlan> {
  const normalizedRoot = path.resolve(workspaceRoot);
  const requirementIds = await discoverRequirementIds(normalizedRoot);
  const skippedArtifacts: string[] = [];
  const conflicts: string[] = [];
  const requirements: BootstrapImportRequirement[] = [];
  for (const requirementId of requirementIds) {
    const workflow = await loadWorkflowState(normalizedRoot, requirementId);
    const changeName = workflow?.stages.IMPLEMENTATION.changeName || `req-${requirementId}`;
    const branchName = workflow?.branchName;
    const scanned = await scanRequirementArtifacts(
      normalizedRoot,
      requirementId,
      branchName,
      changeName,
      workflow?.requirementType || 'REQUIREMENT'
    );
    const artifacts = await buildArtifacts(normalizedRoot, requirementId, scanned, skippedArtifacts, conflicts);
    requirements.push({
      requirementId,
      title: workflow?.title || `需求 ${requirementId}`,
      requirementType: workflow?.requirementType || 'REQUIREMENT',
      branchName: workflow?.branchName || defaultBranchName(requirementId),
      currentStage: workflow?.currentStage || 'PRD',
      status: workflow?.status || 'DRAFT',
      stages: workflow?.stages || createEmptyStages(),
      runs: workflow?.runs || [],
      reviews: workflow?.reviews || [],
      issues: workflow?.issues || [],
      artifacts: dedupeArtifacts(artifacts)
    });
  }
  const estimatedUploadBytes = requirements.flatMap((item) => item.artifacts).reduce((sum, item) => sum + item.size, 0);
  const fingerprint = hashContent(
    JSON.stringify({
      requirements: requirements.map((item) => ({
        requirementId: item.requirementId,
        artifacts: item.artifacts.map((artifact) => ({
          logicalPath: artifact.logicalPath,
          sha256: artifact.sha256,
          size: artifact.size
        }))
      })),
      skippedArtifacts,
      conflicts
    })
  );
  return {
    workspaceRoot: normalizedRoot,
    manifestSha256: fingerprint,
    requirements,
    skippedArtifacts,
    conflicts,
    estimatedUploadBytes
  };
}

export async function importBootstrapPlan(plan: BootstrapImportPlan, config: BootstrapImportConfig): Promise<BootstrapImportResult> {
  const fetcher = config.fetchImpl || fetch;
  const manifestPath = path.join(config.workspaceRoot, MANIFEST_PATH);
  const manifest = await loadManifest(manifestPath, plan.manifestSha256);
  if (config.dryRun) {
    await saveManifest(manifestPath, manifest);
    return {
      skippedArtifacts: plan.skippedArtifacts.length,
      importedArtifacts: 0,
      duplicatedArtifacts: 0,
      failedArtifacts: 0,
      syncedCommits: [],
      manifestPath
    };
  }
  const localContext = toLocalRequestContext(config);
  await syncProjectRepository(localContext);
  const { repoPath } = await resolveProjectRepoPath(localContext);
  const session = manifest.importSessionId
    ? { id: manifest.importSessionId }
    : await postJson(fetcher, config, '/api/ai-delivery/import-sessions', {
        projectId: Number(config.projectId),
        mode: 'IMPORT',
        manifestSha256: plan.manifestSha256,
        dryRun: false,
        source: 'LOCAL_BOOTSTRAP'
      });
  manifest.importSessionId = session.id;
  await saveManifest(manifestPath, manifest);

  const recordsResult = await postJson(fetcher, config, `/api/ai-delivery/import-sessions/${session.id}/records`, toCenterRecords(plan));
  for (const result of recordsResult?.results || []) {
    manifest.items[result.sourceKey] = {
      sourceKey: result.sourceKey,
      status: result.status,
      targetId: result.targetId,
      artifactId: result.artifactId,
      versionId: result.existingVersionId,
      message: result.message
    };
  }
  await saveManifest(manifestPath, manifest);

  let importedArtifacts = 0;
  let duplicatedArtifacts = 0;
  let failedArtifacts = 0;
  const syncedCommits: string[] = [];
  for (const requirement of plan.requirements) {
    const requirementState = manifest.items[`REQUIREMENT:${requirement.requirementId}`];
    const requirementPk = requirementState?.targetId;
    if (!requirementPk) {
      const files = await collectBootstrapFiles(plan.workspaceRoot, requirement);
      for (const file of files) {
        failedArtifacts++;
        manifest.items[file.sourceKey] = {
          ...manifest.items[file.sourceKey],
          sourceKey: file.sourceKey,
          status: 'FAILED',
          message: '中心未返回需求主键，无法写入Git版本索引'
        };
      }
      await saveManifest(manifestPath, manifest);
      continue;
    }

    const files = await copyBootstrapFilesToRepo(plan.workspaceRoot, repoPath, requirement);
    const workflow = toWorkflow(requirement, requirementPk);
    for (const [stage, stageFiles] of groupFilesByStage(files)) {
      const changedFiles = await changedRepoFiles(repoPath, stageFiles.map((file) => file.logicalPath));
      if (!changedFiles.length) {
        for (const file of stageFiles) {
          duplicatedArtifacts++;
          manifest.items[file.sourceKey] = {
            ...manifest.items[file.sourceKey],
            sourceKey: file.sourceKey,
            status: 'DUPLICATED',
            message: 'Git仓中已存在相同内容'
          };
        }
        await saveManifest(manifestPath, manifest);
        continue;
      }

      const changedSet = new Set(changedFiles);
      const changedStageFiles = stageFiles.filter((file) => changedSet.has(file.logicalPath));
      try {
        const syncResult = await confirmArtifactGitSync(localContext, workflow, {
          stage,
          syncType: 'BOOTSTRAP',
          requirementPk,
          files: changedFiles,
          message: `ai-delivery(${requirement.requirementId}): bootstrap ${stage}`
        });
        syncedCommits.push(syncResult.commitSha);
        const versionIds = versionIdsByPath(syncResult.centerResult);
        for (const file of changedStageFiles) {
          importedArtifacts++;
          manifest.items[file.sourceKey] = {
            ...manifest.items[file.sourceKey],
            sourceKey: file.sourceKey,
            status: 'COMPLETED',
            versionId: versionIds.get(file.logicalPath)
          };
        }
      } catch (error: any) {
        for (const file of changedStageFiles) {
          failedArtifacts++;
          manifest.items[file.sourceKey] = {
            ...manifest.items[file.sourceKey],
            sourceKey: file.sourceKey,
            status: 'FAILED',
            message: error.message
          };
        }
      }
      await saveManifest(manifestPath, manifest);
    }
  }
  await postJson(fetcher, config, `/api/ai-delivery/import-sessions/${session.id}/complete`, {});
  return {
    importSessionId: session.id,
    importedArtifacts,
    duplicatedArtifacts,
    failedArtifacts,
    skippedArtifacts: plan.skippedArtifacts.length,
    syncedCommits,
    manifestPath
  };
}

interface BootstrapFileEntry {
  sourceKey: string;
  logicalPath: string;
  stage: WorkflowStage;
  sha256: string;
  absolutePath: string;
}

function toLocalRequestContext(config: BootstrapImportConfig): LocalRequestContext {
  const clientSessionId = String(config.clientSessionId || '').trim();
  if (!clientSessionId) {
    throw new Error('缺少 clientSessionId，无法定位当前客户端的交付工作区');
  }
  return {
    centerBaseUrl: config.centerBaseUrl,
    accessToken: config.accessToken,
    userId: config.userId === undefined ? undefined : String(config.userId),
    projectId: String(config.projectId || ''),
    clientSessionId
  };
}

async function copyBootstrapFilesToRepo(
  sourceRoot: string,
  repoPath: string,
  requirement: BootstrapImportRequirement
): Promise<BootstrapFileEntry[]> {
  const files = await collectBootstrapFiles(sourceRoot, requirement);
  for (const file of files) {
    const targetPath = assertInside(repoPath, path.join(repoPath, file.logicalPath));
    if (path.resolve(file.absolutePath) === path.resolve(targetPath)) {
      continue;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(file.absolutePath, targetPath);
  }
  return files;
}

async function collectBootstrapFiles(sourceRoot: string, requirement: BootstrapImportRequirement): Promise<BootstrapFileEntry[]> {
  const byPath = new Map<string, BootstrapFileEntry>();
  const artifactByPath = new Map(requirement.artifacts.map((artifact) => [artifact.logicalPath.replace(/\\/g, '/'), artifact]));
  const candidates = new Set<string>(artifactByPath.keys());
  const requirementId = normalizeRequirementId(requirement.requirementId);
  const changeName = requirement.stages.IMPLEMENTATION.changeName || `req-${requirementId}`;
  const safeBranch = sanitizeBranchName(requirement.branchName);
  const roots = [
    `docs/${requirementId}`,
    `openspec/changes/${changeName}`,
    'openspec/specs',
    safeBranch ? `docs/code_review/code_review_${safeBranch}` : ''
  ].filter(Boolean);
  for (const root of roots) {
    const files = await listFiles(path.join(sourceRoot, root), 8);
    for (const file of files) {
      candidates.add(path.relative(sourceRoot, file).replace(/\\/g, '/'));
    }
  }
  for (const logicalPath of candidates) {
    if (!isBootstrapGitSyncPath(requirement, logicalPath)) {
      continue;
    }
    const absolutePath = path.join(sourceRoot, logicalPath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      continue;
    }
    const content = await fs.readFile(absolutePath);
    const artifact = artifactByPath.get(logicalPath);
    byPath.set(logicalPath, {
      sourceKey: artifact?.sourceKey || `BOOTSTRAP_FILE:${requirement.requirementId}:${logicalPath}:${hashContent(content)}`,
      logicalPath,
      stage: artifact?.stage || stageForBootstrapPath(logicalPath),
      sha256: hashContent(content),
      absolutePath
    });
  }
  return [...byPath.values()].sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
}

function groupFilesByStage(files: BootstrapFileEntry[]): Map<WorkflowStage, BootstrapFileEntry[]> {
  const groups = new Map<WorkflowStage, BootstrapFileEntry[]>();
  for (const file of files) {
    const group = groups.get(file.stage) || [];
    group.push(file);
    groups.set(file.stage, group);
  }
  return groups;
}

async function changedRepoFiles(repoPath: string, files: string[]): Promise<string[]> {
  if (!files.length) {
    return [];
  }
  const status = await runGit(repoPath, ['status', '--porcelain', '--untracked-files=all', '--', ...files]).catch(() => '');
  const changed = new Set(
    status
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const rawPath = line.slice(3);
        return (rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() || rawPath : rawPath).replace(/\\/g, '/');
      })
  );
  return files.filter((file) => changed.has(file));
}

function toWorkflow(requirement: BootstrapImportRequirement, requirementPk: string | number): RequirementWorkflow {
  const now = new Date().toISOString();
  return {
    id: requirementPk,
    requirementId: requirement.requirementId,
    title: requirement.title,
    requirementType: requirement.requirementType || 'REQUIREMENT',
    branchName: requirement.branchName,
    sources: [],
    currentStage: requirement.currentStage,
    status: requirement.status,
    createdAt: now,
    updatedAt: now,
    stages: requirement.stages,
    artifacts: [],
    runs: requirement.runs,
    reviews: requirement.reviews,
    issues: requirement.issues
  };
}

function versionIdsByPath(centerResult: unknown): Map<string, string | number | undefined> {
  const versions = Array.isArray((centerResult as any)?.versions) ? (centerResult as any).versions : [];
  return new Map(
    versions.map((version: any) => [
      String(version.filePath || version.path || '').replace(/\\/g, '/'),
      version.id
    ])
  );
}

function stageForBootstrapPath(logicalPath: string): WorkflowStage {
  if (logicalPath.includes('/prd/')) {
    return 'PRD';
  }
  if (logicalPath.includes('/technical-design/')) {
    return 'TECH_DESIGN';
  }
  if (logicalPath.includes('/code-review/') || logicalPath.includes('/code_review/')) {
    return 'CODE_REVIEW';
  }
  return 'IMPLEMENTATION';
}

function isBootstrapGitSyncPath(requirement: BootstrapImportRequirement, logicalPath: string): boolean {
  const normalized = logicalPath.replace(/\\/g, '/');
  if (!isSafeRelativePath(normalized)) {
    return false;
  }
  const requirementId = normalizeRequirementId(requirement.requirementId);
  if (isReportRunLogPath(normalized, requirementId)) {
    return false;
  }
  const changeName = requirement.stages.IMPLEMENTATION.changeName || `req-${requirementId}`;
  return (
    (normalized.startsWith(`docs/${requirementId}/`) && !normalized.startsWith(`docs/${requirementId}/workflow/`)) ||
    normalized.startsWith('docs/code_review/') ||
    normalized.startsWith(`openspec/changes/${changeName}/`) ||
    normalized.startsWith('openspec/specs/')
  );
}

function isSafeRelativePath(logicalPath: string): boolean {
  return (
    Boolean(logicalPath) &&
    !logicalPath.startsWith('/') &&
    !logicalPath.includes('../') &&
    !logicalPath.includes('/node_modules/') &&
    !logicalPath.includes('/.git/') &&
    !logicalPath.includes('/target/') &&
    !logicalPath.includes('/dist/') &&
    !/(\.env|secret|private-key|token)/i.test(logicalPath)
  );
}

function assertInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`路径越界: ${target}`);
  }
  return resolvedTarget;
}

function toCenterRecords(plan: BootstrapImportPlan) {
  return {
    requirements: plan.requirements.map((item) => ({
      requirementId: item.requirementId,
      title: item.title,
      requirementType: item.requirementType || 'REQUIREMENT',
      branchName: item.branchName,
      currentStage: item.currentStage,
      status: item.status
    })),
    stages: plan.requirements.flatMap((item) =>
      Object.values(item.stages).map((stage) => ({
        requirementId: item.requirementId,
        stage: stage.stage,
        status: stage.status,
        artifactLogicalPath: stage.artifactPath,
        approvedAt: stage.approvedAt,
        rejectedAt: stage.rejectedAt,
        comment: stage.comment
      }))
    ),
    reviews: plan.requirements.flatMap((item) =>
      item.reviews.map((review) => ({
        sourceKey: `REVIEW:${item.requirementId}:${review.id}`,
        requirementId: item.requirementId,
        stage: review.stage,
        implementationStep: review.implementationStep,
        decision: review.decision,
        comment: review.comment,
        actorId: numericOrUndefined(review.actor)
      }))
    ),
    issues: plan.requirements.flatMap((item) =>
      item.issues.map((issue) => ({
        sourceKey: `ISSUE:${item.requirementId}:${issue.id}`,
        requirementId: item.requirementId,
        severity: issue.severity === 'WARNING' ? 'MINOR' : issue.severity,
        status: issue.status,
        title: issue.title,
        recommendation: issue.recommendation
      }))
    ),
    runs: plan.requirements.flatMap((item) =>
      item.runs.map((run) => ({
        sourceKey: `RUN:${item.requirementId}:${run.id}`,
        requirementId: item.requirementId,
        status: normalizeRunStatus(run.status),
        agentId: run.agentId,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        errorMessage: run.error
      }))
    ),
    runEvents: plan.requirements.flatMap((item) =>
      item.runs.flatMap((run) => runEventsForRun(item.requirementId, run))
    ),
    artifacts: plan.requirements.flatMap((item) =>
      item.artifacts.map((artifact) => ({
        requirementId: item.requirementId,
        logicalPath: artifact.logicalPath,
        label: artifact.label,
        kind: artifactKind(artifact),
        stage: artifact.stage,
        sha256: artifact.sha256,
        size: artifact.size,
        contentType: artifact.contentType
      }))
    )
  };
}

function runEventsForRun(requirementId: string, run: RunRecord) {
  const rawEvents = Array.isArray((run as any).events) ? ((run as any).events as RunEvent[]) : [];
  return rawEvents.map((event, index) => ({
    sourceKey: `RUN_EVENT:${requirementId}:${run.id}:${index + 1}`,
    runSourceKey: `RUN:${requirementId}:${run.id}`,
    seq: index + 1,
    level: event.level || 'INFO',
    type: event.type || 'INFO',
    message: event.message || event.text || '',
    payloadJson: event.data === undefined ? undefined : JSON.stringify(event.data)
  }));
}

async function discoverRequirementIds(workspaceRoot: string): Promise<string[]> {
  const ids = new Set<string>();
  const docsDir = path.join(workspaceRoot, 'docs');
  const docsEntries = await fs.readdir(docsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of docsEntries) {
    if (entry.isDirectory() && entry.name !== 'code_review') {
      ids.add(normalizeRequirementId(entry.name));
    }
  }
  const changeDir = path.join(workspaceRoot, 'openspec', 'changes');
  const changeEntries = await fs.readdir(changeDir, { withFileTypes: true }).catch(() => []);
  for (const entry of changeEntries) {
    if (entry.isDirectory()) {
      const match = entry.name.match(/^req-([a-zA-Z0-9_.-]+)$/);
      if (match) {
        ids.add(normalizeRequirementId(match[1]));
      }
    }
  }
  return Array.from(ids).sort();
}

async function loadWorkflowState(workspaceRoot: string, requirementId: string): Promise<RequirementWorkflow | null> {
  const statePath = path.join(workspaceRoot, 'docs', requirementId, 'workflow', 'state.json');
  const raw = await fs.readFile(statePath, 'utf8').catch(() => '');
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as RequirementWorkflow;
}

async function buildArtifacts(
  workspaceRoot: string,
  requirementId: string,
  scanned: ArtifactRef[],
  skippedArtifacts: string[],
  conflicts: string[]
): Promise<BootstrapImportArtifact[]> {
  const artifacts: BootstrapImportArtifact[] = [];
  const seen = new Set<string>();
  for (const item of scanned) {
    if (!item.exists || item.kind === 'directory') {
      if (!item.exists) {
        skippedArtifacts.push(item.path);
      }
      continue;
    }
    if (!isControlledArtifactPath(item.path)) {
      conflicts.push(`不受控产物路径: ${item.path}`);
      continue;
    }
    if (seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);
    const artifact = await artifactFromPath(workspaceRoot, requirementId, item.stage, item.label, item.path, item.kind);
    if (artifact) {
      artifacts.push(artifact);
    } else {
      skippedArtifacts.push(item.path);
    }
  }
  return artifacts;
}

async function artifactFromPath(
  workspaceRoot: string,
  requirementId: string,
  stage: WorkflowStage,
  label: string,
  relativePath: string,
  kind: ArtifactRef['kind']
): Promise<BootstrapImportArtifact | null> {
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    return null;
  }
  const absolutePath = path.join(workspaceRoot, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }
  const content = await fs.readFile(absolutePath);
  const sha256 = hashContent(content);
  return {
    sourceKey: `ARTIFACT:${requirementId}:${relativePath}:${sha256}`,
    requirementId,
    logicalPath: relativePath,
    label,
    kind,
    stage,
    sha256,
    size: stat.size,
    contentType: contentTypeForPath(relativePath),
    absolutePath
  };
}

function dedupeArtifacts(artifacts: BootstrapImportArtifact[]): BootstrapImportArtifact[] {
  const byKey = new Map<string, BootstrapImportArtifact>();
  for (const artifact of artifacts) {
    byKey.set(artifact.sourceKey, artifact);
  }
  return Array.from(byKey.values()).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
}

async function listFiles(dir: string, maxDepth: number): Promise<string[]> {
  async function walk(current: string, depth: number): Promise<string[]> {
    if (depth > maxDepth) {
      return [];
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    const children = await Promise.all(
      entries.flatMap((entry) => {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'target'].includes(entry.name)) {
            return [];
          }
          return [walk(child, depth + 1)];
        }
        return [[child]];
      })
    );
    return children.flat();
  }
  return walk(dir, 0);
}

function isControlledArtifactPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('../')) {
    return false;
  }
  if (normalized.includes('/node_modules/') || normalized.includes('/.git/') || normalized.includes('/target/') || normalized.includes('/dist/')) {
    return false;
  }
  if (/(\.env|secret|private-key|token)/i.test(normalized)) {
    return false;
  }
  if (isReportRunLogPath(normalized)) {
    return false;
  }
  return (
    (normalized.startsWith('docs/') && !normalized.includes('/workflow/')) ||
    normalized.startsWith('openspec/changes/') ||
    normalized.startsWith('openspec/archive/')
  );
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.html') return 'text/html';
  if (ext === '.json' || ext === '.jsonl') return 'application/json';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.pdf') return 'application/pdf';
  return 'text/plain';
}

function artifactKind(artifact: BootstrapImportArtifact): string {
  if (artifact.stage === 'PRD') return 'PRD';
  if (artifact.stage === 'TECH_DESIGN') return 'TECH_DESIGN';
  if (artifact.stage === 'CODE_REVIEW') return 'CODE_REVIEW';
  if (artifact.logicalPath.includes('/junit/')) return 'JUNIT';
  if (artifact.logicalPath.startsWith('openspec/')) return 'OPENSPEC';
  return artifact.kind.toUpperCase();
}

function normalizeRunStatus(status: RunRecord['status']): string {
  if (status === 'COMPLETED') return 'SUCCEEDED';
  if (status === 'TERMINAL_OPENED' || status === 'WAITING_FOR_AGENT') return 'RUNNING';
  return status;
}

function numericOrUndefined(value?: string | number): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function defaultBranchName(requirementId: string): string {
  return `feature/opp-${sanitizeBranchName(requirementId)}`;
}

async function loadManifest(manifestPath: string, manifestSha256: string): Promise<BootstrapImportManifest> {
  const raw = await fs.readFile(manifestPath, 'utf8').catch(() => '');
  if (!raw) {
    return { manifestSha256, items: {}, updatedAt: new Date().toISOString() };
  }
  const parsed = JSON.parse(raw) as BootstrapImportManifest;
  if (parsed.manifestSha256 !== manifestSha256) {
    return { manifestSha256, items: {}, updatedAt: new Date().toISOString() };
  }
  return parsed;
}

async function saveManifest(manifestPath: string, manifest: BootstrapImportManifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

async function postJson(fetcher: typeof fetch, config: BootstrapImportConfig, urlPath: string, payload: unknown): Promise<any> {
  const response = await fetcher(`${config.centerBaseUrl.replace(/\/+$/, '')}${urlPath}`, {
    method: 'POST',
    headers: authHeaders(config),
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || `中心服务导入失败: ${response.status}`);
  }
  return data?.data ?? data;
}

function authHeaders(config: BootstrapImportConfig): Record<string, string> {
  if (!config.accessToken && !config.userId) {
    throw new Error('缺少登录态 accessToken 或迁移期 userId');
  }
  return {
    'Content-Type': 'application/json',
    ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : { 'X-User-Id': String(config.userId) })
  };
}
