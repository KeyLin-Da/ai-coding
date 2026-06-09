import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';
import { requireDeliveryWorkspaceRoot } from './delivery-workspace';

export interface GitCredentialPayload {
  id: number;
  platform: string;
  fingerprint: string;
  publicKey: string;
  status: string;
}

export interface LocalGitCredentialGenerateInput {
  platform?: string;
  comment?: string;
}

interface LocalKeyPair {
  fingerprint: string;
  publicKey: string;
}

function runCommand(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
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
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || `${command} ${args.join(' ')} 退出码: ${code}`));
    });
  });
}

function safeFingerprintFileName(fingerprint: string): string {
  return fingerprint.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 96) || `key-${Date.now()}`;
}

export async function listGitCredentials(context: LocalRequestContext): Promise<GitCredentialPayload[]> {
  return centerRequest<GitCredentialPayload[]>(context, '/api/ai-delivery/users/me/git-credentials');
}

export async function requireActiveGitCredential(context: LocalRequestContext, platform = 'PROJECT_GIT'): Promise<GitCredentialPayload> {
  const credentials = await listGitCredentials(context);
  const active = credentials.find((item) => item.status === 'ACTIVE' && item.platform === platform) || credentials.find((item) => item.status === 'ACTIVE');
  if (!active) {
    throw new Error('请先在个人中心生成 Git SSH 凭证');
  }
  return active;
}

export async function privateKeyPathForCredential(context: LocalRequestContext, credential: GitCredentialPayload): Promise<string> {
  const root = await requireDeliveryWorkspaceRoot(context);
  return path.join(root, '.ai-delivery', 'keys', safeFingerprintFileName(credential.fingerprint));
}

async function generateLocalKeyPair(context: LocalRequestContext, input: LocalGitCredentialGenerateInput = {}): Promise<LocalKeyPair> {
  const root = await requireDeliveryWorkspaceRoot(context);
  const keysDir = path.join(root, '.ai-delivery', 'keys');
  await fs.mkdir(keysDir, { recursive: true, mode: 0o700 });
  const tempName = `id_ed25519_${Date.now()}`;
  const tempPath = path.join(keysDir, tempName);
  const comment = input.comment || `ai-delivery-${context.userId || 'user'}-${Date.now()}`;
  await runCommand('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', comment, '-f', tempPath], keysDir);
  const publicKeyPath = `${tempPath}.pub`;
  const publicKey = (await fs.readFile(publicKeyPath, 'utf8')).trim();
  const fingerprintOutput = await runCommand('ssh-keygen', ['-lf', publicKeyPath], keysDir);
  const fingerprint = fingerprintOutput.trim().split(/\s+/)[1] || publicKey.slice(0, 64);
  const finalPath = path.join(keysDir, safeFingerprintFileName(fingerprint));
  await fs.rename(tempPath, finalPath);
  await fs.rename(publicKeyPath, `${finalPath}.pub`);
  await fs.chmod(finalPath, 0o600);
  return { fingerprint, publicKey };
}

export async function generateLocalGitCredential(
  context: LocalRequestContext,
  input: LocalGitCredentialGenerateInput = {}
): Promise<GitCredentialPayload> {
  const keyPair = await generateLocalKeyPair(context, input);
  return centerRequest<GitCredentialPayload>(context, '/api/ai-delivery/users/me/git-credentials/generate', {
    method: 'POST',
    body: JSON.stringify({
      platform: input.platform || 'PROJECT_GIT',
      fingerprint: keyPair.fingerprint,
      publicKey: keyPair.publicKey
    })
  });
}

export async function regenerateLocalGitCredential(
  context: LocalRequestContext,
  credentialId: string | number,
  input: LocalGitCredentialGenerateInput = {}
): Promise<GitCredentialPayload> {
  const keyPair = await generateLocalKeyPair(context, input);
  return centerRequest<GitCredentialPayload>(
    context,
    `/api/ai-delivery/users/me/git-credentials/${encodeURIComponent(String(credentialId))}/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify({
        platform: input.platform || 'PROJECT_GIT',
        fingerprint: keyPair.fingerprint,
        publicKey: keyPair.publicKey
      })
    }
  );
}
