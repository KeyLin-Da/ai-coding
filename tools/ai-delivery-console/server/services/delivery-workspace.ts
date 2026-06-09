import path from 'node:path';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';

export interface DeliveryWorkspacePayload {
  id: number;
  clientSessionId: number;
  localPath: string;
  status: string;
}

export async function loadDeliveryWorkspace(context: LocalRequestContext): Promise<DeliveryWorkspacePayload | undefined> {
  const clientSessionId = String(context.clientSessionId || '').trim();
  if (!clientSessionId) {
    throw new Error('缺少客户端会话ID，无法读取交付工作区');
  }
  return centerRequest<DeliveryWorkspacePayload | undefined>(
    context,
    `/api/ai-delivery/users/me/delivery-workspace?clientSessionId=${encodeURIComponent(clientSessionId)}`
  );
}

export async function requireDeliveryWorkspaceRoot(context: LocalRequestContext): Promise<string> {
  const workspace = await loadDeliveryWorkspace(context);
  const localPath = workspace?.localPath?.trim();
  if (!localPath) {
    throw new Error('请先在个人中心配置交付工作区');
  }
  if (!path.isAbsolute(localPath)) {
    throw new Error(`交付工作区必须是绝对路径: ${localPath}`);
  }
  return path.resolve(localPath);
}

export function assertInsideDeliveryWorkspace(deliveryWorkspaceRoot: string, filePath: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(deliveryWorkspaceRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`路径不在交付工作区内: ${filePath}`);
  }
  return absolute;
}
