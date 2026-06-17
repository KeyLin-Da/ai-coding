import path from 'node:path';
import type { LocalRequestContext } from './local-request-context';
import { centerRequest } from './center-client';
import { localServiceError } from './local-errors';

export interface DeliveryWorkspacePayload {
  id: number;
  projectId: number;
  clientSessionId?: number;
  localPath: string;
  status: string;
}

export async function loadDeliveryWorkspace(context: LocalRequestContext): Promise<DeliveryWorkspacePayload | undefined> {
  const projectId = String(context.projectId || '').trim();
  if (!projectId) {
    throw localServiceError('B70003', '缺少项目ID，无法读取交付工作区');
  }
  return centerRequest<DeliveryWorkspacePayload | undefined>(
    context,
    `/api/ai-delivery/projects/${encodeURIComponent(projectId)}/delivery-workspace`
  );
}

export async function requireDeliveryWorkspaceRoot(context: LocalRequestContext): Promise<string> {
  const workspace = await loadDeliveryWorkspace(context);
  const localPath = workspace?.localPath?.trim();
  if (!localPath) {
    throw localServiceError('B70071', '请先在个人中心配置当前项目交付工作区');
  }
  if (!path.isAbsolute(localPath)) {
    throw localServiceError('B70066', `交付工作区必须是绝对路径: ${localPath}`);
  }
  return path.resolve(localPath);
}

export function assertInsideDeliveryWorkspace(deliveryWorkspaceRoot: string, filePath: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(deliveryWorkspaceRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw localServiceError('B70065', `路径不在交付工作区内: ${filePath}`);
  }
  return absolute;
}
