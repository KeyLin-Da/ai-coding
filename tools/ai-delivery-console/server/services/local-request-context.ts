import type { IncomingMessage } from 'node:http';
import type { URL } from 'node:url';
import type { ProjectSettingsLookupContext } from './project-settings';

export interface LocalRequestContext extends ProjectSettingsLookupContext {
  clientSessionId?: string;
}

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function bearerToken(request: IncomingMessage): string {
  const authorization = headerValue(request, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function parseLocalRequestContext(request: IncomingMessage, url: URL): LocalRequestContext {
  return {
    accessToken: bearerToken(request),
    userId: headerValue(request, 'x-user-id') || url.searchParams.get('userId') || '',
    projectId: headerValue(request, 'x-project-id') || url.searchParams.get('projectId') || '',
    clientSessionId: headerValue(request, 'x-client-session-id') || url.searchParams.get('clientSessionId') || '',
    centerBaseUrl:
      headerValue(request, 'x-center-base-url') ||
      headerValue(request, 'x-ai-delivery-center-base-url') ||
      url.searchParams.get('centerBaseUrl') ||
      process.env.AI_DELIVERY_CENTER_BASE_URL ||
      ''
  };
}
