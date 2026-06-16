import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  TechDesignVersion,
  TechDesignVersionContent,
  TechDesignVersionDiff,
  TechDesignVersionDiffInput,
  TechDesignVersionSource
} from '../../shared/workflow';
import { getRequirementRuntimeDir } from './runtime-paths';
import { assertInsideWorkspace, hashContent, normalizeRequirementId } from './workspace';
import { runGit } from './project-repository';

const CURRENT_VERSION_ID = 'current';
const DESIGN_RELATIVE_SUFFIX = 'technical-design/design_review.md';
const MAX_GIT_VERSIONS = 30;
const MAX_DIFF_LENGTH = 220_000;

function designDocumentPath(requirementId: string): string {
  return `docs/${normalizeRequirementId(requirementId)}/${DESIGN_RELATIVE_SUFFIX}`;
}

function draftVersionDir(workspaceRoot: string, requirementId: string): string {
  return path.join(getRequirementRuntimeDir(workspaceRoot, requirementId), 'technical-design', 'draft-versions');
}

function normalizeVersionId(versionId: string): string {
  const normalized = String(versionId || '').trim();
  if (!normalized) {
    throw new Error('版本ID不能为空');
  }
  return normalized;
}

async function readText(filePath: string): Promise<string | undefined> {
  return fs.readFile(filePath, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
}

async function statTime(filePath: string): Promise<string | undefined> {
  return fs.stat(filePath).then((stat) => stat.mtime.toISOString()).catch(() => undefined);
}

function versionFromContent(input: {
  id: string;
  source: TechDesignVersionSource;
  label: string;
  artifactPath: string;
  content?: string;
  createdAt?: string;
  versionNo?: number;
  commitSha?: string;
  readable?: boolean;
  unreadableReason?: string;
}): TechDesignVersion {
  return {
    id: input.id,
    source: input.source,
    label: input.label,
    artifactPath: input.artifactPath,
    contentHash: input.content == null ? undefined : hashContent(input.content),
    versionNo: input.versionNo,
    commitSha: input.commitSha,
    createdAt: input.createdAt,
    readable: input.readable ?? input.content != null,
    unreadableReason: input.unreadableReason
  };
}

async function currentVersion(workspaceRoot: string, requirementId: string): Promise<TechDesignVersion> {
  const relative = designDocumentPath(requirementId);
  const absolute = assertInsideWorkspace(workspaceRoot, relative);
  const content = await readText(absolute);
  return versionFromContent({
    id: CURRENT_VERSION_ID,
    source: 'CURRENT_DRAFT',
    label: '当前草稿',
    artifactPath: relative,
    content,
    createdAt: await statTime(absolute),
    readable: content != null,
    unreadableReason: content == null ? '当前技术方案文档尚未生成' : undefined
  });
}

async function listDraftSnapshots(workspaceRoot: string, requirementId: string): Promise<TechDesignVersion[]> {
  const dir = draftVersionDir(workspaceRoot, requirementId);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name).sort().reverse();
  return Promise.all(
    files.map(async (fileName, index) => {
      const absolute = path.join(dir, fileName);
      const content = await readText(absolute);
      const stamp = fileName.replace(/\.md$/i, '');
      return versionFromContent({
        id: `snapshot:${stamp}`,
        source: 'DRAFT_SNAPSHOT',
        label: `草稿快照 ${files.length - index}`,
        artifactPath: designDocumentPath(requirementId),
        content,
        createdAt: await statTime(absolute),
        readable: content != null,
        unreadableReason: content == null ? '草稿快照不存在' : undefined
      });
    })
  );
}

async function isGitRepository(workspaceRoot: string): Promise<boolean> {
  return runGit(workspaceRoot, ['rev-parse', '--is-inside-work-tree'])
    .then((value) => value.trim() === 'true')
    .catch(() => false);
}

async function gitFileAtCommit(workspaceRoot: string, commitSha: string, relativePath: string): Promise<string | undefined> {
  return runGit(workspaceRoot, ['show', `${commitSha}:${relativePath}`]).catch(() => undefined);
}

async function listPublishedVersions(workspaceRoot: string, requirementId: string): Promise<TechDesignVersion[]> {
  if (!(await isGitRepository(workspaceRoot))) {
    return [];
  }
  const relative = designDocumentPath(requirementId);
  const output = await runGit(workspaceRoot, ['log', `-n${MAX_GIT_VERSIONS}`, '--format=%H%x09%ct%x09%an', '--', relative]).catch(() => '');
  const rows = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const total = rows.length;
  const versions = await Promise.all(
    rows.map(async (row, index) => {
      const [commitSha = '', timestamp = '', author = ''] = row.split('\t');
      const content = commitSha ? await gitFileAtCommit(workspaceRoot, commitSha, relative) : undefined;
      const versionNo = total - index;
      return {
        ...versionFromContent({
          id: `git:${commitSha}`,
          source: 'PUBLISHED',
          label: `v${versionNo}`,
          artifactPath: relative,
          content,
          versionNo,
          commitSha,
          createdAt: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : undefined,
          readable: content != null,
          unreadableReason: content == null ? '历史版本内容不可读取，请先同步项目仓' : undefined
        }),
        createdBy: author || undefined
      } satisfies TechDesignVersion;
    })
  );
  return versions;
}

export async function listTechDesignVersions(workspaceRoot: string, requirementId: string): Promise<TechDesignVersion[]> {
  const [current, snapshots, published] = await Promise.all([
    currentVersion(workspaceRoot, requirementId),
    listDraftSnapshots(workspaceRoot, requirementId),
    listPublishedVersions(workspaceRoot, requirementId)
  ]);
  return [current, ...snapshots, ...published];
}

async function readSnapshotContent(workspaceRoot: string, requirementId: string, versionId: string): Promise<TechDesignVersionContent> {
  const snapshotId = versionId.replace(/^snapshot:/, '');
  if (!/^[a-zA-Z0-9_.-]+$/.test(snapshotId)) {
    throw new Error(`草稿快照ID不合法: ${versionId}`);
  }
  const absolute = path.join(draftVersionDir(workspaceRoot, requirementId), `${snapshotId}.md`);
  const content = await readText(absolute);
  const version = versionFromContent({
    id: versionId,
    source: 'DRAFT_SNAPSHOT',
    label: '草稿快照',
    artifactPath: designDocumentPath(requirementId),
    content,
    createdAt: await statTime(absolute),
    readable: content != null,
    unreadableReason: content == null ? '草稿快照不存在' : undefined
  });
  if (content == null) {
    throw new Error(version.unreadableReason);
  }
  return { version, content };
}

async function readGitVersionContent(workspaceRoot: string, requirementId: string, versionId: string): Promise<TechDesignVersionContent> {
  const commitSha = versionId.replace(/^git:/, '');
  if (!/^[a-fA-F0-9]{7,40}$/.test(commitSha)) {
    throw new Error(`Git版本ID不合法: ${versionId}`);
  }
  const relative = designDocumentPath(requirementId);
  const content = await gitFileAtCommit(workspaceRoot, commitSha, relative);
  const version = versionFromContent({
    id: versionId,
    source: 'PUBLISHED',
    label: commitSha.slice(0, 8),
    artifactPath: relative,
    content,
    commitSha,
    readable: content != null,
    unreadableReason: content == null ? '历史版本内容不可读取，请先同步项目仓' : undefined
  });
  if (content == null) {
    throw new Error(version.unreadableReason);
  }
  return { version, content };
}

export async function readTechDesignVersionContent(
  workspaceRoot: string,
  requirementId: string,
  rawVersionId: string
): Promise<TechDesignVersionContent> {
  const versionId = normalizeVersionId(rawVersionId);
  if (versionId === CURRENT_VERSION_ID) {
    const version = await currentVersion(workspaceRoot, requirementId);
    if (!version.readable) {
      throw new Error(version.unreadableReason || '当前技术方案文档不可读取');
    }
    const content = await readText(assertInsideWorkspace(workspaceRoot, designDocumentPath(requirementId)));
    return { version, content: content || '' };
  }
  if (versionId.startsWith('snapshot:')) {
    return readSnapshotContent(workspaceRoot, requirementId, versionId);
  }
  if (versionId.startsWith('git:')) {
    return readGitVersionContent(workspaceRoot, requirementId, versionId);
  }
  throw new Error(`未知技术方案版本: ${versionId}`);
}

function truncateDiff(diff: string): { diff: string; truncated: boolean } {
  if (diff.length <= MAX_DIFF_LENGTH) {
    return { diff, truncated: false };
  }
  return {
    diff: `${diff.slice(0, MAX_DIFF_LENGTH)}\n\n... diff 内容过长，已截断 ...\n`,
    truncated: true
  };
}

function relabelNoIndexDiff(diff: string, leftLabel: string, rightLabel: string): string {
  return diff
    .replace(/^diff --git a\/left\.md b\/right\.md/m, `diff --git a/${leftLabel} b/${rightLabel}`)
    .replace(/^--- a\/left\.md/m, `--- a/${leftLabel}`)
    .replace(/^\+\+\+ b\/right\.md/m, `+++ b/${rightLabel}`);
}

function runDiff(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `git ${args.join(' ')} 退出码: ${code}`));
    });
  });
}

export async function diffTechDesignVersions(
  workspaceRoot: string,
  requirementId: string,
  input: TechDesignVersionDiffInput
): Promise<TechDesignVersionDiff> {
  const [leftContent, rightContent] = await Promise.all([
    readTechDesignVersionContent(workspaceRoot, requirementId, input.leftVersionId),
    readTechDesignVersionContent(workspaceRoot, requirementId, input.rightVersionId)
  ]);
  if (leftContent.content === rightContent.content) {
    return {
      left: leftContent.version,
      right: rightContent.version,
      diff: '',
      truncated: false
    };
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-tech-design-diff-'));
  const leftPath = path.join(tempDir, 'left.md');
  const rightPath = path.join(tempDir, 'right.md');
  await fs.writeFile(leftPath, leftContent.content, 'utf8');
  await fs.writeFile(rightPath, rightContent.content, 'utf8');
  const rawDiff = await runDiff(tempDir, [
    'diff',
    '--no-index',
    '--no-ext-diff',
    leftPath,
    rightPath
  ]).finally(() => fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined));
  const { diff, truncated } = truncateDiff(relabelNoIndexDiff(rawDiff, leftContent.version.label, rightContent.version.label));
  return {
    left: leftContent.version,
    right: rightContent.version,
    diff,
    truncated
  };
}

export async function createTechDesignDraftSnapshot(workspaceRoot: string, requirementId: string): Promise<TechDesignVersion | undefined> {
  const relative = designDocumentPath(requirementId);
  const absolute = assertInsideWorkspace(workspaceRoot, relative);
  const content = await readText(absolute);
  if (!content) {
    return undefined;
  }
  const dir = draftVersionDir(workspaceRoot, requirementId);
  await fs.mkdir(dir, { recursive: true });
  const contentHash = hashContent(content);
  const existing = await listDraftSnapshots(workspaceRoot, requirementId);
  if (existing.some((version) => version.contentHash === contentHash)) {
    return undefined;
  }
  const stamp = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${contentHash.slice(0, 8)}`;
  const snapshotPath = path.join(dir, `${stamp}.md`);
  await fs.writeFile(snapshotPath, content, 'utf8');
  return versionFromContent({
    id: `snapshot:${stamp}`,
    source: 'DRAFT_SNAPSHOT',
    label: '草稿快照',
    artifactPath: relative,
    content,
    createdAt: await statTime(snapshotPath),
    readable: true
  });
}

export const internalForTests = {
  designDocumentPath,
  draftVersionDir,
  truncateDiff
};
