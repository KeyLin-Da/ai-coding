export interface GitTreeFileLike {
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
}

export type GitTreeFileKind = 'changed' | 'untracked';
export type GitTreeNodeType = 'directory' | 'file';

export interface GitTreeNode<T extends GitTreeFileLike = GitTreeFileLike> {
  key: string;
  name: string;
  path: string;
  type: GitTreeNodeType;
  depth: number;
  file?: T;
  fileKind?: GitTreeFileKind;
  children: GitTreeNode<T>[];
  changedCount: number;
  untrackedCount: number;
  additions: number;
  deletions: number;
}

export interface GitTreeRow<T extends GitTreeFileLike = GitTreeFileLike> extends GitTreeNode<T> {
  expanded: boolean;
  hasChildren: boolean;
}

function createTreeNode<T extends GitTreeFileLike>(
  input: Omit<GitTreeNode<T>, 'children' | 'changedCount' | 'untrackedCount' | 'additions' | 'deletions'>
): GitTreeNode<T> {
  return {
    ...input,
    children: [],
    changedCount: 0,
    untrackedCount: 0,
    additions: 0,
    deletions: 0
  };
}

function splitTreePath(filePath: string): string[] {
  return filePath.split('/').filter(Boolean);
}

function sortTreeNode<T extends GitTreeFileLike>(node: GitTreeNode<T>) {
  node.children.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
  });
  node.children.forEach(sortTreeNode);
}

export function buildFileTree<T extends GitTreeFileLike>(files: T[], untrackedFiles: T[] = []): GitTreeNode<T> {
  const root = createTreeNode<T>({
    key: '__root__',
    name: '根目录',
    path: '',
    type: 'directory',
    depth: -1
  });
  const directories = new Map<string, GitTreeNode<T>>();

  const addFile = (file: T, fileKind: GitTreeFileKind) => {
    const segments = splitTreePath(file.path);
    const fileName = segments.pop() || file.path;
    let parent = root;
    let directoryPath = '';
    const ancestors = [root];

    for (const segment of segments) {
      directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment;
      let directory = directories.get(directoryPath);
      if (!directory) {
        directory = createTreeNode<T>({
          key: `directory:${directoryPath}`,
          name: segment,
          path: directoryPath,
          type: 'directory',
          depth: parent.depth + 1
        });
        directories.set(directoryPath, directory);
        parent.children.push(directory);
      }
      parent = directory;
      ancestors.push(parent);
    }

    parent.children.push(
      createTreeNode<T>({
        key: `${fileKind}:${file.path}`,
        name: fileName,
        path: file.path,
        type: 'file',
        depth: parent.depth + 1,
        file,
        fileKind
      })
    );

    const changedCount = fileKind === 'changed' ? 1 : 0;
    const untrackedCount = fileKind === 'untracked' ? 1 : 0;
    const additions = file.additions || 0;
    const deletions = file.deletions || 0;
    for (const ancestor of ancestors) {
      ancestor.changedCount += changedCount;
      ancestor.untrackedCount += untrackedCount;
      ancestor.additions += additions;
      ancestor.deletions += deletions;
    }
  };

  files.forEach((file) => addFile(file, 'changed'));
  untrackedFiles.forEach((file) => addFile(file, 'untracked'));
  sortTreeNode(root);
  return root;
}

export function flattenTreeRows<T extends GitTreeFileLike>(
  node: GitTreeNode<T>,
  collapsedDirectoryPaths: string[],
  rows: GitTreeRow<T>[] = []
): GitTreeRow<T>[] {
  for (const child of node.children) {
    const expanded = child.type === 'directory' && !collapsedDirectoryPaths.includes(child.path);
    rows.push({
      ...child,
      expanded,
      hasChildren: child.children.length > 0
    });
    if (child.type === 'directory' && expanded) {
      flattenTreeRows(child, collapsedDirectoryPaths, rows);
    }
  }
  return rows;
}

export function extractFileDiff(diff: string, filePath: string): string {
  return extractFileDiffSections(diff, filePath)[0] || '';
}

export function extractFilesDiff(diff: string, filePaths: string[]): string {
  if (!filePaths.length) {
    return '';
  }
  const byPath = filePaths.flatMap((filePath) => extractFileDiffSections(diff, filePath)).filter(Boolean);
  return [...new Set(byPath)].join('\n');
}

export function extractFileDiffSections(diff: string, filePath: string): string[] {
  const normalizedPath = normalizeDiffPath(filePath);
  if (!diff.trim() || !normalizedPath) {
    return [];
  }
  return splitDiffSections(diff).filter((section) => diffSectionMatchesPath(section, normalizedPath));
}

export function findFirstChangedNewLine(diff: string): number | undefined {
  for (const section of splitDiffSections(diff)) {
    const line = firstChangedLineInSection(section);
    if (line != null) {
      return line;
    }
  }
  return undefined;
}

export function filePathToneClass(file?: GitTreeFileLike): string {
  const status = file?.status || '';
  if (status === '??') {
    return 'git-file-path-pending';
  }
  if (status.includes('A')) {
    return 'git-file-path-added';
  }
  if (status.includes('M')) {
    return 'git-file-path-modified';
  }
  return '';
}

function normalizeDiffPath(filePath: string): string {
  return String(filePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function splitDiffSections(diff: string): string[] {
  return diff
    .split(/^diff --git /gm)
    .filter(Boolean)
    .map((section) => `diff --git ${section}`);
}

function diffSectionMatchesPath(section: string, filePath: string): boolean {
  return (
    section.includes(` a/${filePath} `) ||
    section.includes(` b/${filePath}`) ||
    section.includes(`--- a/${filePath}`) ||
    section.includes(`+++ b/${filePath}`) ||
    section.includes(`rename from ${filePath}`) ||
    section.includes(`rename to ${filePath}`)
  );
}

function firstChangedLineInSection(section: string): number | undefined {
  let currentNewLine = 0;
  let fallbackLine: number | undefined;
  let sawDeletion = false;

  for (const line of section.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      currentNewLine = Number(hunk[1]);
      fallbackLine = currentNewLine;
      sawDeletion = false;
      continue;
    }
    if (!fallbackLine) {
      continue;
    }
    if (line.startsWith('+++')) {
      continue;
    }
    if (line.startsWith('+')) {
      return currentNewLine;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      sawDeletion = true;
      continue;
    }
    if (line.startsWith(' ')) {
      if (sawDeletion) {
        return currentNewLine;
      }
      currentNewLine += 1;
    }
  }

  return fallbackLine;
}
