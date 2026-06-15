import type { RunEvent } from '@shared/workflow';
import { apiClient } from '@/api/client';
import { getApiRuntimeConfig, resolveWebSocketUrl } from '@/api/runtime';

export interface RealtimeDomainEvent {
  id?: number;
  projectId: number;
  eventId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payloadJson?: string;
  createdAt?: string;
}

interface RealtimeEventPage {
  events?: RealtimeDomainEvent[];
  refreshRequired?: boolean;
  refreshScope?: string;
  nextEventId?: number;
}

interface CenterRunEvent {
  id?: number;
  runId: number;
  seq: number;
  level: RunEvent['level'];
  type: 'stdout' | 'stderr' | 'exit' | 'cancelled';
  message: string;
  payloadJson?: string;
  createdAt?: string;
}

interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

interface ProjectSubscription {
  projectId: number;
  lastEventId: number;
  requirementPk?: number;
}

interface RunSubscription {
  runId: number;
  afterSeq: number;
}

export interface RealtimeClientOptions {
  onDomainEvent?: (event: RealtimeDomainEvent) => void;
  onRunEvent?: (event: RunEvent, raw: CenterRunEvent) => void;
  onRefreshRequired?: (scope?: string) => void;
  onStatus?: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR') => void;
}

export class RealtimeClient {
  private socket?: WebSocket;
  private connected = false;
  private connectPromise?: Promise<void>;
  private connectResolve?: () => void;
  private connectReject?: (error: Error) => void;
  private nextSubscriptionId = 1;
  private processedEventIds = new Set<number>();
  private projectSubscriptions = new Map<string, ProjectSubscription>();
  private runSubscriptions = new Map<string, RunSubscription>();
  private activeDestinations = new Set<string>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private destroyed = false;
  private lastEventId = 0;

  constructor(private readonly options: RealtimeClientOptions = {}) {}

  async connect(): Promise<void> {
    this.destroyed = false;
    this.clearReconnectTimer();
    if (this.connected) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    const runtime = getApiRuntimeConfig();
    if (!runtime.userId || !runtime.projectId || !runtime.clientSessionId) {
      throw new Error('远程实时协作需要配置 userId、projectId 和 clientSessionId');
    }
    this.options.onStatus?.('CONNECTING');
    const ticket = await apiClient.createWsTicket(runtime.clientSessionId);
    const wsUrl = resolveWebSocketUrl(ticket.wsUrl || '/api/ai-delivery/ws');
    this.activeDestinations.clear();
    this.socket = new WebSocket(wsUrl);
    this.socket.onopen = () => {
      this.sendFrame('CONNECT', {
        'accept-version': '1.2',
        'heart-beat': '20000,20000',
        ticket: ticket.ticket
      });
    };
    this.socket.onmessage = (message) => this.handleMessage(String(message.data));
    this.socket.onerror = () => {
      this.options.onStatus?.('ERROR');
      this.connectReject?.(new Error('WebSocket 连接失败'));
    };
    this.socket.onclose = () => {
      this.connected = false;
      this.connectPromise = undefined;
      this.activeDestinations.clear();
      this.options.onStatus?.('DISCONNECTED');
      this.scheduleReconnect();
    };
    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });
    return this.connectPromise;
  }

  async subscribeProject(projectId: string | number, lastEventId = 0, requirementPk?: string | number) {
    const subscription: ProjectSubscription = {
      projectId: Number(projectId),
      lastEventId,
      requirementPk: requirementPk ? Number(requirementPk) : undefined
    };
    this.projectSubscriptions.set(projectSubscriptionKey(subscription), subscription);
    const wasConnected = this.connected;
    await this.connect();
    if (wasConnected) {
      this.sendProjectSubscription(subscription);
    }
  }

  async subscribeRun(runId: string | number, afterSeq = 0) {
    const subscription: RunSubscription = {
      runId: Number(runId),
      afterSeq
    };
    this.runSubscriptions.set(String(subscription.runId), subscription);
    const wasConnected = this.connected;
    await this.connect();
    if (wasConnected) {
      this.sendRunSubscription(subscription);
    }
  }

  ack(projectId: string | number, lastEventId: number) {
    if (!this.connected) {
      return;
    }
    this.lastEventId = Math.max(this.lastEventId, lastEventId);
    for (const subscription of this.projectSubscriptions.values()) {
      if (subscription.projectId === Number(projectId)) {
        subscription.lastEventId = Math.max(subscription.lastEventId, lastEventId);
      }
    }
    this.sendJson('/app/events/ack', {
      projectId: Number(projectId),
      lastEventId
    });
  }

  heartbeat(projectId?: string | number) {
    if (!this.connected) {
      return;
    }
    this.sendJson('/app/presence/heartbeat', {
      projectId: projectId ? Number(projectId) : undefined
    });
  }

  disconnect() {
    this.destroyed = true;
    this.clearReconnectTimer();
    if (this.socket && this.connected) {
      this.sendFrame('DISCONNECT', {});
    }
    this.socket?.close();
    this.socket = undefined;
    this.connected = false;
    this.connectPromise = undefined;
  }

  private subscribe(destination: string) {
    if (this.activeDestinations.has(destination)) {
      return;
    }
    this.activeDestinations.add(destination);
    this.sendFrame('SUBSCRIBE', {
      id: `sub-${this.nextSubscriptionId++}`,
      destination
    });
  }

  private sendJson(destination: string, body: unknown) {
    this.sendFrame(
      'SEND',
      {
        destination,
        'content-type': 'application/json'
      },
      JSON.stringify(body)
    );
  }

  private sendFrame(command: string, headers: Record<string, string>, body = '') {
    const headerText = Object.entries(headers)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}:${value}`)
      .join('\n');
    this.socket?.send(`${command}\n${headerText}\n\n${body}\0`);
  }

  private handleMessage(data: string) {
    for (const raw of data.split('\0').filter(Boolean)) {
      const frame = parseFrame(raw);
      if (frame.command === 'CONNECTED') {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.options.onStatus?.('CONNECTED');
        this.restoreSubscriptions();
        this.connectResolve?.();
        continue;
      }
      if (frame.command === 'MESSAGE') {
        this.handleMessageFrame(frame);
      }
    }
  }

  private handleMessageFrame(frame: StompFrame) {
    const destination = frame.headers.destination || '';
    const payload = parseJson(frame.body);
    if (!payload) {
      return;
    }
    if (destination.includes('/run-events') || destination.includes('/topic/runs/')) {
      const events = Array.isArray(payload) ? payload : [payload];
      for (const event of events as CenterRunEvent[]) {
        const subscription = this.runSubscriptions.get(String(event.runId));
        if (subscription) {
          subscription.afterSeq = Math.max(subscription.afterSeq, event.seq || 0);
        }
        this.options.onRunEvent?.(centerRunEventToRunEvent(event), event);
      }
      return;
    }
    if (isEventPage(payload)) {
      if (payload.refreshRequired) {
        this.options.onRefreshRequired?.(payload.refreshScope);
        return;
      }
      for (const event of payload.events || []) {
        this.emitDomainEvent(event);
      }
      return;
    }
    this.emitDomainEvent(payload as RealtimeDomainEvent);
  }

  private emitDomainEvent(event: RealtimeDomainEvent) {
    if (!event || typeof event.eventId !== 'number') {
      return;
    }
    if (this.processedEventIds.has(event.eventId)) {
      return;
    }
    this.processedEventIds.add(event.eventId);
    this.lastEventId = Math.max(this.lastEventId, event.eventId);
    this.options.onDomainEvent?.(event);
  }

  private restoreSubscriptions() {
    for (const subscription of this.projectSubscriptions.values()) {
      this.sendProjectSubscription(subscription);
    }
    for (const subscription of this.runSubscriptions.values()) {
      this.sendRunSubscription(subscription);
    }
  }

  private sendProjectSubscription(subscription: ProjectSubscription) {
    this.subscribe('/user/queue/events');
    this.subscribe(`/topic/projects/${subscription.projectId}/events`);
    if (subscription.requirementPk) {
      this.subscribe(`/topic/requirements/${subscription.requirementPk}/events`);
    }
    this.sendJson(`/app/projects/${subscription.projectId}/subscribe`, {
      lastEventId: Math.max(subscription.lastEventId, this.lastEventId),
      requirementPk: subscription.requirementPk
    });
  }

  private sendRunSubscription(subscription: RunSubscription) {
    this.subscribe('/user/queue/run-events');
    this.subscribe(`/topic/runs/${subscription.runId}/events`);
    this.sendJson(`/app/runs/${subscription.runId}/subscribe`, { afterSeq: subscription.afterSeq });
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer || (!this.projectSubscriptions.size && !this.runSubscriptions.size)) {
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => undefined);
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}

function projectSubscriptionKey(subscription: ProjectSubscription): string {
  return `${subscription.projectId}:${subscription.requirementPk || ''}`;
}

function parseFrame(raw: string): StompFrame {
  const [head, ...bodyParts] = raw.split('\n\n');
  const [command, ...headerLines] = head.split('\n').filter(Boolean);
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      headers[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }
  return {
    command,
    headers,
    body: bodyParts.join('\n\n')
  };
}

function parseJson(value: string): unknown {
  try {
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function isEventPage(value: unknown): value is RealtimeEventPage {
  return Boolean(value && typeof value === 'object' && ('events' in value || 'refreshRequired' in value));
}

function centerRunEventToRunEvent(item: CenterRunEvent): RunEvent {
  const typeMap: Record<CenterRunEvent['type'], RunEvent['type']> = {
    stdout: 'STDOUT',
    stderr: 'STDERR',
    exit: 'EXIT',
    cancelled: 'CANCELLED'
  };
  return {
    time: item.createdAt || new Date().toISOString(),
    type: typeMap[item.type] || 'INFO',
    level: item.level,
    message: item.message,
    text: item.message,
    data: parseJson(item.payloadJson || '') || item.payloadJson
  };
}
