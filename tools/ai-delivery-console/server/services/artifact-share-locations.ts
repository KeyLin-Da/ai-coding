import path from 'node:path';
import { readConsoleStateFile, writeConsoleStateFile } from './console-state';

const STATE_FILE = 'artifact-share-locations.json';

export interface ArtifactShareLocationDescriptor {
  id: number | string;
  projectId: number | string;
  requirementId: string;
  artifactPath: string;
  token?: string;
}

interface ArtifactShareLocation extends ArtifactShareLocationDescriptor {
  id: string;
  projectId: string;
  artifactRoot: string;
  updatedAt: string;
}

interface ArtifactShareLocationState {
  version: 1;
  shares: Record<string, ArtifactShareLocation>;
}

const updateQueues = new Map<string, Promise<void>>();

function emptyState(): ArtifactShareLocationState {
  return { version: 1, shares: {} };
}

function normalizeDescriptor(share: ArtifactShareLocationDescriptor) {
  return {
    id: String(share.id || '').trim(),
    projectId: String(share.projectId || '').trim(),
    requirementId: String(share.requirementId || '').trim(),
    artifactPath: String(share.artifactPath || '').trim().replace(/\\/g, '/'),
    token: String(share.token || '').trim() || undefined
  };
}

function matchesLocation(location: ArtifactShareLocation | undefined, descriptor: ReturnType<typeof normalizeDescriptor>) {
  return Boolean(
    location &&
      location.projectId === descriptor.projectId &&
      location.requirementId === descriptor.requirementId &&
      location.artifactPath === descriptor.artifactPath
  );
}

function parseState(content: string): ArtifactShareLocationState {
  if (!content.trim()) {
    return emptyState();
  }
  try {
    const parsed = JSON.parse(content) as Partial<ArtifactShareLocationState>;
    return {
      version: 1,
      shares: parsed.shares && typeof parsed.shares === 'object' ? parsed.shares : {}
    };
  } catch {
    return emptyState();
  }
}

async function readState(workspaceRoot: string): Promise<ArtifactShareLocationState> {
  return parseState(await readConsoleStateFile(workspaceRoot, STATE_FILE));
}

async function updateState(workspaceRoot: string, update: (state: ArtifactShareLocationState) => void): Promise<void> {
  const queueKey = path.resolve(workspaceRoot);
  const previous = updateQueues.get(queueKey) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const state = await readState(workspaceRoot);
    update(state);
    await writeConsoleStateFile(workspaceRoot, STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  });
  updateQueues.set(queueKey, next);
  try {
    await next;
  } finally {
    if (updateQueues.get(queueKey) === next) {
      updateQueues.delete(queueKey);
    }
  }
}

export async function rememberArtifactShareLocation(
  workspaceRoot: string,
  share: ArtifactShareLocationDescriptor,
  artifactRoot: string
): Promise<void> {
  const descriptor = normalizeDescriptor(share);
  if (!path.isAbsolute(artifactRoot)) {
    throw new Error('公开分享本地产物仓必须是绝对路径');
  }
  const normalizedRoot = path.resolve(artifactRoot);
  if (!descriptor.id || !descriptor.projectId || !descriptor.requirementId || !descriptor.artifactPath) {
    throw new Error('公开分享缺少本地产物仓绑定信息');
  }
  await updateState(workspaceRoot, (state) => {
    const existing = state.shares[descriptor.id];
    state.shares[descriptor.id] = {
      ...descriptor,
      token: descriptor.token || (matchesLocation(existing, descriptor) ? existing.token : undefined),
      artifactRoot: normalizedRoot,
      updatedAt: new Date().toISOString()
    };
  });
}

export async function findArtifactShareRoot(
  workspaceRoot: string,
  share: ArtifactShareLocationDescriptor
): Promise<string | undefined> {
  const descriptor = normalizeDescriptor(share);
  const location = (await readState(workspaceRoot)).shares[descriptor.id];
  if (
    !location ||
    !matchesLocation(location, descriptor) ||
    typeof location.artifactRoot !== 'string' ||
    !path.isAbsolute(location.artifactRoot)
  ) {
    return undefined;
  }
  return path.resolve(location.artifactRoot);
}

export async function findArtifactShareToken(
  workspaceRoot: string,
  share: ArtifactShareLocationDescriptor
): Promise<string | undefined> {
  const descriptor = normalizeDescriptor(share);
  const location = (await readState(workspaceRoot)).shares[descriptor.id];
  if (!location || !matchesLocation(location, descriptor) || typeof location.token !== 'string' || !location.token.trim()) {
    return undefined;
  }
  return location.token.trim();
}
