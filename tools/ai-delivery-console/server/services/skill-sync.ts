import fs from 'node:fs/promises';
import path from 'node:path';

const AGENT_SKILL_DIRS = ['.codex', '.codebuddy', '.qoder', '.qwen'];
const OPEN_SPEC_DIR = 'openspec';

export interface ProjectArtifactBootstrapResult {
  openSpecInitialized: boolean;
  agentDirsInitialized: string[];
  codingSkills: {
    synced: number;
    targetDirs: string[];
  };
}

export async function syncCodingSkills(workspaceRoot: string, targetWorkspaceRoot = workspaceRoot): Promise<{ synced: number; targetDirs: string[] }> {
  const skillsDir = path.join(workspaceRoot, 'skills');
  
  try {
    await fs.access(skillsDir);
  } catch {
    console.log('[skill-sync] skills/ 目录不存在，跳过同步');
    return { synced: 0, targetDirs: [] };
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const codingDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('coding-'))
    .map((entry) => entry.name);

  if (!codingDirs.length) {
    console.log('[skill-sync] skills/ 下无 coding-* 目录，跳过同步');
    return { synced: 0, targetDirs: [] };
  }

  const targetDirs: string[] = [];

  for (const agentDir of AGENT_SKILL_DIRS) {
    const targetBase = path.join(targetWorkspaceRoot, agentDir, 'skills');
    
    // Create target directory if not exists
    await fs.mkdir(targetBase, { recursive: true });
    
    for (const skillName of codingDirs) {
      const sourceDir = path.join(skillsDir, skillName);
      const targetDir = path.join(targetBase, skillName);
      
      // Copy entire directory recursively
      await copyDirectory(sourceDir, targetDir);
    }
    
    targetDirs.push(targetBase);
  }

  console.log(`[skill-sync] 已同步 ${codingDirs.length} 个 coding-* 技能到 ${targetDirs.length} 个 agent 目录`);
  return { synced: codingDirs.length, targetDirs };
}

export async function bootstrapProjectArtifactWorkspace(
  workspaceRoot: string,
  targetWorkspaceRoot: string
): Promise<ProjectArtifactBootstrapResult> {
  const [openSpecInitialized, agentDirsInitialized] = await Promise.all([
    ensureOpenSpecWorkspace(workspaceRoot, targetWorkspaceRoot),
    ensureAgentWorkspaces(workspaceRoot, targetWorkspaceRoot)
  ]);
  const codingSkills = await syncCodingSkills(workspaceRoot, targetWorkspaceRoot);

  return {
    openSpecInitialized,
    agentDirsInitialized,
    codingSkills
  };
}

async function copyDirectory(source: string, target: string): Promise<void> {
  // Remove existing target directory to ensure clean overwrite
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
  
  await fs.mkdir(target, { recursive: true });
  
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      const content = await fs.readFile(sourcePath);
      await fs.writeFile(targetPath, content);
    }
  }
}

async function ensureOpenSpecWorkspace(workspaceRoot: string, targetWorkspaceRoot: string): Promise<boolean> {
  const sourceOpenSpec = path.join(workspaceRoot, OPEN_SPEC_DIR);
  const targetOpenSpec = path.join(targetWorkspaceRoot, OPEN_SPEC_DIR);
  if (!(await exists(sourceOpenSpec))) {
    return false;
  }

  const existed = await exists(targetOpenSpec);
  await fs.mkdir(targetOpenSpec, { recursive: true });

  await copyFileIfMissing(
    path.join(sourceOpenSpec, 'config.yaml'),
    path.join(targetOpenSpec, 'config.yaml')
  );
  await copyDirectoryMerge(
    path.join(sourceOpenSpec, 'specs'),
    path.join(targetOpenSpec, 'specs'),
    { overwrite: false }
  );
  await fs.mkdir(path.join(targetOpenSpec, 'changes'), { recursive: true });

  return !existed;
}

async function ensureAgentWorkspaces(workspaceRoot: string, targetWorkspaceRoot: string): Promise<string[]> {
  const initialized: string[] = [];

  for (const agentDir of AGENT_SKILL_DIRS) {
    const sourceAgentDir = path.join(workspaceRoot, agentDir);
    const targetAgentDir = path.join(targetWorkspaceRoot, agentDir);
    if (!(await exists(sourceAgentDir))) {
      continue;
    }
    const existed = await exists(targetAgentDir);
    await copyDirectoryMerge(sourceAgentDir, targetAgentDir, {
      overwrite: true,
      filter(relativePath) {
        const normalized = normalizeRelativePath(relativePath);
        if (normalized === 'commands' || normalized.startsWith('commands/')) {
          return true;
        }
        if (normalized === 'skills') {
          return true;
        }
        return normalized.startsWith('skills/') && !normalized.startsWith('skills/coding-');
      }
    });
    if (!existed) {
      initialized.push(targetAgentDir);
    }
  }

  return initialized;
}

async function copyFileIfMissing(source: string, target: string): Promise<void> {
  if (!(await exists(source)) || (await exists(target))) {
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const content = await fs.readFile(source);
  await fs.writeFile(target, content);
}

async function copyDirectoryMerge(
  source: string,
  target: string,
  options: {
    overwrite: boolean;
    filter?: (relativePath: string) => boolean;
  },
  relativeRoot = ''
): Promise<void> {
  if (!(await exists(source))) {
    return;
  }

  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') {
      continue;
    }

    const relativePath = path.join(relativeRoot, entry.name);
    if (options.filter && !options.filter(relativePath)) {
      continue;
    }

    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryMerge(sourcePath, targetPath, options, relativePath);
      continue;
    }
    if (!options.overwrite && (await exists(targetPath))) {
      continue;
    }
    const content = await fs.readFile(sourcePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
  }
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}
