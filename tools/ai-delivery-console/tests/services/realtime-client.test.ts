import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { setApiRuntimeConfig } from '@/api/runtime';
import { RealtimeClient } from '@/services/realtime-client';

vi.mock('@/api/client', () => ({
  apiClient: {
    createWsTicket: vi.fn()
  }
}));

const createWsTicket = vi.mocked(apiClient.createWsTicket);

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(frame: string) {
    this.sent.push(frame);
  }

  close() {
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  receive(frame: string) {
    this.onmessage?.({ data: frame });
  }
}

async function nextSocket(index = 0): Promise<FakeWebSocket> {
  for (let attempt = 0; attempt < 10 && !FakeWebSocket.instances[index]; attempt += 1) {
    await Promise.resolve();
  }
  const socket = FakeWebSocket.instances[index];
  if (!socket) {
    throw new Error(`FakeWebSocket ${index} not created`);
  }
  return socket;
}

describe('realtime-client', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    createWsTicket.mockReset();
    createWsTicket.mockResolvedValue({
      ticket: 'ticket-1',
      wsUrl: '/api/ai-delivery/ws',
      expireAt: '2026-06-05T12:00:00+08:00'
    });
    vi.stubGlobal('WebSocket', FakeWebSocket);
    setApiRuntimeConfig({
      mode: 'remote',
      centerBaseUrl: 'https://center.example.com',
      userId: '1',
      projectId: '2',
      clientSessionId: '3'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('连接后发送 STOMP CONNECT 并订阅项目事件', async () => {
    const received: number[] = [];
    const client = new RealtimeClient({
      onDomainEvent: (event) => received.push(event.eventId)
    });

    const connecting = client.connect();
    const socket = await nextSocket();
    socket.open();
    expect(socket.sent[0]).toContain('CONNECT');
    expect(socket.sent[0]).toContain('ticket:ticket-1');
    socket.receive('CONNECTED\nversion:1.2\n\n\0');
    await connecting;

    await client.subscribeProject('2', 10, '99');
    expect(socket.sent.some((frame) => frame.includes('destination:/topic/projects/2/events'))).toBe(true);
    expect(socket.sent.some((frame) => frame.includes('destination:/app/projects/2/subscribe'))).toBe(true);

    const eventFrame = 'MESSAGE\ndestination:/topic/projects/2/events\n\n{"projectId":2,"eventId":11,"eventType":"artifact.version.created","aggregateType":"ARTIFACT","aggregateId":9}\0';
    socket.receive(eventFrame);
    socket.receive(eventFrame);
    expect(received).toEqual([11]);

    client.ack('2', 11);
    expect(socket.sent.some((frame) => frame.includes('destination:/app/events/ack') && frame.includes('"lastEventId":11'))).toBe(true);
  });

  it('收到补偿刷新要求时触发刷新回调', async () => {
    const refresh = vi.fn();
    const client = new RealtimeClient({
      onRefreshRequired: refresh
    });

    const subscribing = client.subscribeProject('2', 10);
    const socket = await nextSocket();
    socket.open();
    socket.receive('CONNECTED\nversion:1.2\n\n\0');
    await subscribing;

    socket.receive('MESSAGE\ndestination:/user/queue/events\n\n{"refreshRequired":true,"refreshScope":"PROJECT","nextEventId":99}\0');

    expect(refresh).toHaveBeenCalledWith('PROJECT');
  });

  it('断线后使用最新 eventId 重新订阅', async () => {
    vi.useFakeTimers();
    const client = new RealtimeClient();

    const subscribing = client.subscribeProject('2', 10);
    const first = await nextSocket();
    first.open();
    first.receive('CONNECTED\nversion:1.2\n\n\0');
    await subscribing;
    first.receive('MESSAGE\ndestination:/topic/projects/2/events\n\n{"projectId":2,"eventId":12,"eventType":"workflow.stage.updated","aggregateType":"REQUIREMENT","aggregateId":9}\0');

    first.close();
    await vi.advanceTimersByTimeAsync(1000);

    const second = await nextSocket(1);
    second.open();
    second.receive('CONNECTED\nversion:1.2\n\n\0');

    expect(createWsTicket).toHaveBeenCalledTimes(2);
    expect(second.sent.some((frame) => frame.includes('destination:/app/projects/2/subscribe') && frame.includes('"lastEventId":12'))).toBe(true);
  });

  it('无需项目成员上下文即可订阅 token 范围的分享批注事件并在断线后恢复', async () => {
    vi.useFakeTimers();
    setApiRuntimeConfig({ projectId: '' });
    const received = vi.fn();
    const client = new RealtimeClient({ onShareAnnotationEvent: received });

    const subscribing = client.subscribeArtifactShare(300, 'public-token', 'channel-hash');
    const first = await nextSocket();
    first.open();
    first.receive('CONNECTED\nversion:1.2\n\n\0');
    await subscribing;

    expect(first.sent.some((frame) =>
      frame.includes('destination:/topic/artifact-shares/300/channel-hash/annotations')
      && frame.includes('share-token:public-token')
    )).toBe(true);
    first.receive(
      'MESSAGE\ndestination:/topic/artifact-shares/300/channel-hash/annotations\n\n'
      + '{"shareId":300,"eventId":88,"eventType":"tech-design.annotation.changed","operation":"CREATED"}\0'
    );
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ shareId: 300, eventId: 88 }));

    first.close();
    await vi.advanceTimersByTimeAsync(1000);
    const second = await nextSocket(1);
    second.open();
    second.receive('CONNECTED\nversion:1.2\n\n\0');
    expect(second.sent.some((frame) => frame.includes('/topic/artifact-shares/300/channel-hash/annotations'))).toBe(true);
  });
});
