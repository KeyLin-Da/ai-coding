import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactRef, RequirementType, WorkflowStage } from '../../shared/workflow';
import { hashContent, normalizeRequirementId, sanitizeBranchName } from './workspace';
import { normalizeOpenSpecChangeName, resolveOpenSpecRoot } from './openspec-summary';

async function fileArtifact(workspaceRoot: string, id: string, stage: WorkflowStage, label: string, relativePath: string, kind: ArtifactRef['kind']): Promise<ArtifactRef> {
  const absolutePath = path.join(workspaceRoot, relativePath);
  try {
    const stat = await fs.stat(absolutePath);
    const hash = stat.isFile() ? hashContent(await fs.readFile(absolutePath)) : undefined;
    return {
      id,
      stage,
      label,
      path: relativePath,
      kind,
      exists: true,
      hash,
      updatedAt: stat.mtime.toISOString()
    };
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return { id, stage, label, path: relativePath, kind, exists: false };
  }
}

async function existingFileArtifact(
  workspaceRoot: string,
  id: string,
  stage: WorkflowStage,
  label: string,
  relativePath: string,
  kind: ArtifactRef['kind']
): Promise<ArtifactRef | undefined> {
  const artifact = await fileArtifact(workspaceRoot, id, stage, label, relativePath, kind);
  return artifact.exists ? artifact : undefined;
}

async function listFiles(dir: string, maxDepth = 2): Promise<string[]> {
  async function walk(current: string, depth: number): Promise<string[]> {
    if (depth > maxDepth) {
      return [];
    }
    try {
      const entries = await fs.readdir(current, { withFileTypes: true });
      const children = await Promise.all(
        entries.flatMap((entry) => {
          const child = path.join(current, entry.name);
          if (entry.isDirectory()) {
            return [walk(child, depth + 1)];
          }
          return [[child]];
        })
      );
      return children.flat();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
  return walk(dir, 0);
}

function artifactKindForFile(filePath: string): ArtifactRef['kind'] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') {
    return 'html';
  }
  if (ext === '.md' || ext === '.markdown') {
    return 'markdown';
  }
  if (ext === '.json') {
    return 'json';
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
    return 'image';
  }
  return 'text';
}

export async function scanRequirementArtifacts(
  workspaceRoot: string,
  requirementId: string,
  branchName?: string,
  changeName?: string,
  requirementType: RequirementType = 'REQUIREMENT'
): Promise<ArtifactRef[]> {
  const id = normalizeRequirementId(requirementId);
  const artifacts: ArtifactRef[] = [];
  const prdAnalysis = await fileArtifact(workspaceRoot, 'prd-analysis', 'PRD', 'PRD 分析文档', `docs/${id}/prd/analysis.md`, 'markdown');
  if (requirementType !== 'DEFECT' || prdAnalysis.exists) {
    artifacts.push(prdAnalysis);
  }
  artifacts.push(await fileArtifact(workspaceRoot, 'technical-design', 'TECH_DESIGN', '技术方案评审文档', `docs/${id}/technical-design/design_review.md`, 'markdown'));
  const techDesignQuestions = await existingFileArtifact(
    workspaceRoot,
    'technical-design-questions',
    'TECH_DESIGN',
    '技术方案答疑记录',
    `docs/${id}/technical-design/questions.md`,
    'markdown'
  );
  if (techDesignQuestions) {
    artifacts.push(techDesignQuestions);
  }
  const techDesignAnnotations = await existingFileArtifact(
    workspaceRoot,
    'technical-design-annotations',
    'TECH_DESIGN',
    '技术方案批注记录',
    `docs/${id}/technical-design/annotations/comments.md`,
    'markdown'
  );
  if (techDesignAnnotations) {
    artifacts.push(techDesignAnnotations);
  }
  const techDesignInputLedger = await existingFileArtifact(
    workspaceRoot,
    'technical-design-input-ledger',
    'TECH_DESIGN',
    '技术方案输入消费台账',
    `docs/${id}/technical-design/input-ledger.json`,
    'json'
  );
  if (techDesignInputLedger) {
    artifacts.push(techDesignInputLedger);
  }
  const techDesignQuestionFiles = await listFiles(path.join(workspaceRoot, 'docs', id, 'technical-design', 'questions'), 2);
  for (const file of techDesignQuestionFiles.filter((item) => /\.md$/i.test(item))) {
    const relative = path.relative(workspaceRoot, file);
    artifacts.push(
      await fileArtifact(
        workspaceRoot,
        `technical-design-question-${artifacts.length}`,
        'TECH_DESIGN',
        `技术方案答疑 ${path.basename(file, path.extname(file))}`,
        relative,
        'markdown'
      )
    );
  }
  const techDesignSourceFiles = await listFiles(path.join(workspaceRoot, 'docs', id, 'technical-design', 'file'), 2);
  for (const file of techDesignSourceFiles) {
    const relative = path.relative(workspaceRoot, file);
    artifacts.push(await fileArtifact(workspaceRoot, `technical-design-source-${artifacts.length}`, 'TECH_DESIGN', path.basename(file), relative, artifactKindForFile(file)));
  }

  const openSpecChangeName = normalizeOpenSpecChangeName(changeName || `req-${id}`, `req-${id}`);
  const openSpecRoot = await resolveOpenSpecRoot(workspaceRoot, openSpecChangeName);
  artifacts.push(await fileArtifact(workspaceRoot, 'openspec-change', 'IMPLEMENTATION', openSpecRoot.archived ? 'OpenSpec Change（已归档）' : 'OpenSpec Change', openSpecRoot.rootPath, 'directory'));
  artifacts.push(await fileArtifact(workspaceRoot, 'openspec-proposal', 'IMPLEMENTATION', 'OpenSpec Proposal', `${openSpecRoot.rootPath}/proposal.md`, 'markdown'));
  artifacts.push(await fileArtifact(workspaceRoot, 'openspec-design', 'IMPLEMENTATION', 'OpenSpec Design', `${openSpecRoot.rootPath}/design.md`, 'markdown'));
  artifacts.push(await fileArtifact(workspaceRoot, 'openspec-tasks', 'IMPLEMENTATION', 'OpenSpec Tasks', `${openSpecRoot.rootPath}/tasks.md`, 'markdown'));
  const specFiles = await listFiles(path.join(workspaceRoot, openSpecRoot.rootPath, 'specs'), 5);
  for (const file of specFiles.filter((item) => /\.md$/i.test(item))) {
    const relative = path.relative(workspaceRoot, file);
    artifacts.push(await fileArtifact(workspaceRoot, `openspec-spec-${artifacts.length}`, 'IMPLEMENTATION', `OpenSpec ${path.basename(path.dirname(file))}`, relative, 'markdown'));
  }

  const junitFiles = await listFiles(path.join(workspaceRoot, 'docs', id, 'junit'), 3);
  for (const file of junitFiles.filter((item) => /\.(md|html)$/i.test(item))) {
    const relative = path.relative(workspaceRoot, file);
    artifacts.push(await fileArtifact(workspaceRoot, `junit-${artifacts.length}`, 'IMPLEMENTATION', path.basename(file), relative, file.endsWith('.html') ? 'html' : 'markdown'));
  }

  const requirementReviewArtifacts = [
    {
      id: 'code-review-index',
      label: '代码评审索引',
      path: `docs/${id}/code-review/summary.md`
    },
    {
      id: 'code-review-commit',
      label: '代码评审（commit 正式评审）',
      path: `docs/${id}/code-review/commit/summary.md`
    },
    {
      id: 'code-review-staged',
      label: '代码评审（staged 暂存区预审）',
      path: `docs/${id}/code-review/staged/summary.md`
    }
  ];
  for (const item of requirementReviewArtifacts) {
    const artifact = await existingFileArtifact(workspaceRoot, item.id, 'CODE_REVIEW', item.label, item.path, 'markdown');
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  const reviewDirs = await fs.readdir(path.join(workspaceRoot, 'docs', 'code_review'), { withFileTypes: true }).catch(() => []);
  const safeBranch = sanitizeBranchName(branchName);
  const matchedReviewDirs = reviewDirs
    .filter((entry) => entry.isDirectory())
    .filter((entry) => (safeBranch ? entry.name === `code_review_${safeBranch}` : entry.name.includes(id)));

  for (const entry of matchedReviewDirs) {
    const summaryPath = `docs/code_review/${entry.name}/summary.md`;
    artifacts.push(await fileArtifact(workspaceRoot, `code-review-${entry.name}`, 'CODE_REVIEW', `代码评审 ${entry.name}`, summaryPath, 'markdown'));
  }

  return artifacts;
}
