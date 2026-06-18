import fs from 'node:fs/promises';
import path from 'node:path';
import { getConsoleStateDir, getLegacyHashedConsoleStateDir } from './runtime-paths';

function consoleStateFilePath(workspaceRoot: string, fileName: string): string {
  return path.join(getConsoleStateDir(workspaceRoot), fileName);
}

function legacyConsoleStateFilePath(workspaceRoot: string, fileName: string): string {
  return path.join(workspaceRoot, 'docs', '.ai-delivery-console', fileName);
}

function legacyHashedConsoleStateFilePath(workspaceRoot: string, fileName: string): string {
  return path.join(getLegacyHashedConsoleStateDir(workspaceRoot), fileName);
}

async function readIfExists(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8').catch((error: any) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
}

async function removeLegacyFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true }).catch(() => undefined);
  await fs.rmdir(path.dirname(filePath)).catch(() => undefined);
}

export async function readConsoleStateFile(workspaceRoot: string, fileName: string): Promise<string> {
  const currentPath = consoleStateFilePath(workspaceRoot, fileName);
  const current = await readIfExists(currentPath);
  const legacyHashedPath = legacyHashedConsoleStateFilePath(workspaceRoot, fileName);
  const legacyPath = legacyConsoleStateFilePath(workspaceRoot, fileName);
  if (current.trim()) {
    await removeLegacyFile(legacyHashedPath);
    await removeLegacyFile(legacyPath);
    return current;
  }

  const legacyHashed = await readIfExists(legacyHashedPath);
  const legacy = legacyHashed.trim() ? legacyHashed : await readIfExists(legacyPath);
  if (!legacy.trim()) {
    return '';
  }
  await fs.mkdir(path.dirname(currentPath), { recursive: true });
  await fs.writeFile(currentPath, legacy, 'utf8');
  await removeLegacyFile(legacyHashedPath);
  await removeLegacyFile(legacyPath);
  return legacy;
}

export async function writeConsoleStateFile(workspaceRoot: string, fileName: string, content: string): Promise<string> {
  const currentPath = consoleStateFilePath(workspaceRoot, fileName);
  await fs.mkdir(path.dirname(currentPath), { recursive: true });
  await fs.writeFile(currentPath, content, 'utf8');
  await removeLegacyFile(legacyHashedConsoleStateFilePath(workspaceRoot, fileName));
  await removeLegacyFile(legacyConsoleStateFilePath(workspaceRoot, fileName));
  return currentPath;
}
