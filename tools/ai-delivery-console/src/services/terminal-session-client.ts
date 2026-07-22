import type { RunStatus, TerminalSessionStatus } from '@shared/workflow';
import { getApiRuntimeConfig, resolveRunnerWebSocketUrl } from '@/api/runtime';

export type TerminalServerMessage =
  | { type: 'output'; data: string; replay?: boolean; truncated?: boolean }
  | { type: 'status'; status: RunStatus | TerminalSessionStatus }
  | { type: 'exit'; status: RunStatus; exitCode?: number; signal?: number }
  | { type: 'ready' }
  | { type: 'error'; message: string };

export interface TerminalSessionClientOptions {
  runId: string;
  onOutput?: (data: string, message: Extract<TerminalServerMessage, { type: 'output' }>) => void;
  onStatus?: (status: TerminalSessionStatus | RunStatus) => void;
  onExit?: (message: Extract<TerminalServerMessage, { type: 'exit' }>) => void;
  onError?: (message: string) => void;
}

export class TerminalSessionClient {
  private socket?: WebSocket;
  private manuallyClosed = false;

  constructor(private readonly options: TerminalSessionClientOptions) {}

  connect(): void {
    this.close();
    this.manuallyClosed = false;
    if (typeof WebSocket === 'undefined') {
      this.options.onStatus?.('UNAVAILABLE');
      this.options.onError?.('当前运行环境不支持 WebSocket');
      return;
    }

    this.options.onStatus?.('CONNECTING');
    const socket = new WebSocket(this.buildUrl());
    this.socket = socket;
    socket.onopen = () => {
      this.options.onStatus?.('CONNECTED');
    };
    socket.onmessage = (event) => {
      this.handleMessage(String(event.data));
    };
    socket.onerror = () => {
      this.options.onStatus?.('ERROR');
      this.options.onError?.('内嵌终端连接失败');
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = undefined;
      }
      if (!this.manuallyClosed) {
        this.options.onStatus?.('DISCONNECTED');
      }
    };
  }

  reconnect(): void {
    this.options.onStatus?.('RECONNECTING');
    this.connect();
  }

  sendInput(data: string): void {
    this.send({ type: 'input', data });
  }

  resize(cols: number, rows: number): void {
    this.send({ type: 'resize', cols, rows });
  }

  signal(signal: 'SIGINT'): void {
    this.send({ type: 'signal', signal });
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.socket && typeof WebSocket !== 'undefined' && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = undefined;
  }

  private buildUrl(): string {
    const runtime = getApiRuntimeConfig();
    const params = new URLSearchParams();
    if (runtime.projectId) {
      params.set('projectId', runtime.projectId);
    }
    if (runtime.clientSessionId) {
      params.set('clientSessionId', runtime.clientSessionId);
    }
    if (runtime.userId) {
      params.set('userId', runtime.userId);
    }
    const query = params.toString();
    return resolveRunnerWebSocketUrl(`/api/ai-delivery/runs/${encodeURIComponent(this.options.runId)}/terminal${query ? `?${query}` : ''}`);
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.options.onError?.('内嵌终端尚未连接');
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  private handleMessage(raw: string): void {
    let message: TerminalServerMessage;
    try {
      message = JSON.parse(raw) as TerminalServerMessage;
    } catch {
      this.options.onError?.('内嵌终端消息格式异常');
      return;
    }
    if (message.type === 'output') {
      this.options.onOutput?.(message.data, message);
      return;
    }
    if (message.type === 'status') {
      this.options.onStatus?.(message.status);
      return;
    }
    if (message.type === 'exit') {
      this.options.onExit?.(message);
      this.options.onStatus?.('READONLY');
      return;
    }
    if (message.type === 'error') {
      this.options.onStatus?.('UNAVAILABLE');
      this.options.onError?.(message.message);
    }
  }
}
