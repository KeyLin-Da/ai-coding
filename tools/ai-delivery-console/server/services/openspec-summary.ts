import fs from 'node:fs/promises';
import path from 'node:path';
import type { OpenSpecArtifactRef, OpenSpecSummary, OpenSpecTaskGroup, OpenSpecTaskItem } from '../../shared/workflow';
import { assertInsideWorkspace, toRelativePath } from './workspace';

const changeNamePattern = /^[a-zA-Z0-9_.-]+$/;

export function normalizeOpenSpecChangeName(value: string, fallback: string): string {
  const changeName = (value || fallback).trim();
  if (!changeNamePattern.test(changeName)) {
    throw new Error(`非法 OpenSpec change name: ${changeName}`);
  }
  return changeName;
}

async function pathExists(absolutePath: string): Promise<boolean> {
  return fs
    .stat(absolutePath)
    .then(() => true)
    .catch((error: any) => {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    });
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  async function walk(current: string): Promise<string[]> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch((error: any) => {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
    const children = await Promise.all(
      entries.map(async (entry) => {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) {
          return walk(child);
        }
        return /\.md$/i.test(entry.name) ? [child] : [];
      })
    );
    return children.flat();
  }
  return walk(dir);
}

export async function resolveOpenSpecRoot(workspaceRoot: string, changeName: string): Promise<{ rootPath: string; exists: boolean; archived: boolean; archivePath?: string }> {
  const activePath = path.join(workspaceRoot, 'openspec', 'changes', changeName);
  if (await pathExists(activePath)) {
    return {
      rootPath: toRelativePath(workspaceRoot, activePath),
      exists: true,
      archived: false
    };
  }

  const archiveDir = path.join(workspaceRoot, 'openspec', 'changes', 'archive');
  const archivedEntries = await fs.readdir(archiveDir, { withFileTypes: true }).catch((error: any) => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const matched = archivedEntries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${changeName}`))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (matched[0]) {
    const archivedPath = path.join(archiveDir, matched[0]);
    const relative = toRelativePath(workspaceRoot, archivedPath);
    return {
      rootPath: relative,
      exists: true,
      archived: true,
      archivePath: relative
    };
  }

  return {
    rootPath: toRelativePath(workspaceRoot, activePath),
    exists: false,
    archived: false
  };
}

async function artifact(workspaceRoot: string, rootPath: string, type: OpenSpecArtifactRef['type'], label: string, relativePath: string): Promise<OpenSpecArtifactRef> {
  const fullPath = path.posix.join(rootPath.replace(/\\/g, '/'), relativePath);
  const absolutePath = assertInsideWorkspace(workspaceRoot, fullPath);
  return {
    id: `${type}-${fullPath}`,
    type,
    label,
    path: fullPath,
    exists: await pathExists(absolutePath)
  };
}

function parseTaskLine(line: string, index: number): OpenSpecTaskItem | undefined {
  const match = line.match(/^\s*-\s+\[( |x|X)\]\s+(.+)$/);
  if (!match) {
    return undefined;
  }
  const rawTitle = match[2].trim();
  const idMatch = rawTitle.match(/^([0-9]+(?:\.[0-9]+)*[a-zA-Z]?)\s+(.+)$/);
  return {
    id: idMatch?.[1],
    title: idMatch?.[2] || rawTitle,
    completed: match[1].toLowerCase() === 'x',
    line: index + 1,
    raw: rawTitle
  };
}

function replaceTaskLine(line: string, completed: boolean): string {
  return line.replace(/^(\s*-\s+\[)( |x|X)(\]\s+.+)$/, `$1${completed ? 'x' : ' '}$3`);
}

export function parseOpenSpecTasks(content: string): { total: number; completed: number; groups: OpenSpecTaskGroup[] } {
  const groups: OpenSpecTaskGroup[] = [];
  let currentGroup: OpenSpecTaskGroup = { title: '未分组', items: [] };

  content.split(/\r?\n/).forEach((line, index) => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      currentGroup = { title: heading[1].trim(), items: [] };
      groups.push(currentGroup);
      return;
    }
    const task = parseTaskLine(line, index);
    if (!task) {
      return;
    }
    if (!groups.includes(currentGroup)) {
      groups.push(currentGroup);
    }
    currentGroup.items.push(task);
  });

  const visibleGroups = groups.filter((group) => group.items.length);
  const total = visibleGroups.reduce((sum, group) => sum + group.items.length, 0);
  const completed = visibleGroups.reduce((sum, group) => sum + group.items.filter((item) => item.completed).length, 0);
  return { total, completed, groups: visibleGroups };
}

export async function readOpenSpecSummary(workspaceRoot: string, rawChangeName: string, fallbackChangeName: string): Promise<OpenSpecSummary> {
  const changeName = normalizeOpenSpecChangeName(rawChangeName, fallbackChangeName);
  const resolved = await resolveOpenSpecRoot(workspaceRoot, changeName);
  const rootPath = resolved.rootPath.replace(/\\/g, '/');
  const fixedArtifacts = await Promise.all([
    artifact(workspaceRoot, rootPath, 'proposal', 'Proposal', 'proposal.md'),
    artifact(workspaceRoot, rootPath, 'design', 'Design', 'design.md'),
    artifact(workspaceRoot, rootPath, 'tasks', 'Tasks', 'tasks.md')
  ]);

  const specsDir = assertInsideWorkspace(workspaceRoot, path.posix.join(rootPath, 'specs'));
  const specFiles = (await listMarkdownFiles(specsDir)).sort();
  const specs = await Promise.all(
    specFiles.map(async (file) => {
      const relative = toRelativePath(workspaceRoot, file).replace(/\\/g, '/');
      return {
        id: `spec-${relative}`,
        type: 'spec' as const,
        label: relative.replace(`${rootPath}/specs/`, ''),
        path: relative,
        exists: true
      };
    })
  );

  const tasksPath = path.posix.join(rootPath, 'tasks.md');
  const tasksContent = await fs.readFile(assertInsideWorkspace(workspaceRoot, tasksPath), 'utf8').catch(() => '');

  return {
    changeName,
    rootPath,
    exists: resolved.exists,
    archived: resolved.archived,
    archivePath: resolved.archivePath,
    artifacts: fixedArtifacts,
    specs,
    tasks: parseOpenSpecTasks(tasksContent)
  };
}

export async function updateOpenSpecTaskStatus(
  workspaceRoot: string,
  rawChangeName: string,
  fallbackChangeName: string,
  line: number,
  completed: boolean,
  expectedRaw?: string
): Promise<OpenSpecSummary> {
  const changeName = normalizeOpenSpecChangeName(rawChangeName, fallbackChangeName);
  const resolved = await resolveOpenSpecRoot(workspaceRoot, changeName);
  if (!resolved.exists) {
    throw new Error(`OpenSpec change 不存在: ${changeName}`);
  }
  if (resolved.archived) {
    throw new Error('OpenSpec change 已归档，任务只读');
  }
  if (!Number.isInteger(line) || line <= 0) {
    throw new Error('任务行号无效');
  }

  const tasksPath = path.posix.join(resolved.rootPath.replace(/\\/g, '/'), 'tasks.md');
  const absolutePath = assertInsideWorkspace(workspaceRoot, tasksPath);
  const content = await fs.readFile(absolutePath, 'utf8');
  const lines = content.split('\n');
  const index = line - 1;
  const originalLine = lines[index];
  if (originalLine === undefined) {
    throw new Error('任务行不存在，请刷新后重试');
  }

  const hasCarriageReturn = originalLine.endsWith('\r');
  const lineText = hasCarriageReturn ? originalLine.slice(0, -1) : originalLine;
  const task = parseTaskLine(lineText, index);
  if (!task) {
    throw new Error('目标行不是 OpenSpec 任务，请刷新后重试');
  }
  if (expectedRaw && task.raw !== expectedRaw) {
    throw new Error('任务内容已变化，请刷新后重试');
  }

  lines[index] = `${replaceTaskLine(lineText, completed)}${hasCarriageReturn ? '\r' : ''}`;
  await fs.writeFile(absolutePath, lines.join('\n'), 'utf8');
  return readOpenSpecSummary(workspaceRoot, changeName, fallbackChangeName);
}
