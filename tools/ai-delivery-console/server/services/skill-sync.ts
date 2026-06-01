import fs from 'node:fs/promises';
import path from 'node:path';

const AGENT_SKILL_DIRS = ['.codex', '.codebuddy', '.qoder', '.qwen'];

export async function syncCodingSkills(workspaceRoot: string): Promise<{ synced: number; targetDirs: string[] }> {
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
    const targetBase = path.join(workspaceRoot, agentDir, 'skills');
    
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
