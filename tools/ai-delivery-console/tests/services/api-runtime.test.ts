import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveApiUrl,
  resolveRunnerApiUrl,
  resolveWebSocketUrl,
  setApiRuntimeConfig
} from '../../src/api/runtime';

function stubPageLocation(protocol: 'http:' | 'https:' | 'file:', origin: string) {
  vi.stubGlobal('window', {
    location: {
      protocol,
      origin
    }
  });
}

describe('api runtime 同源网关', () => {
  beforeEach(() => {
    setApiRuntimeConfig({
      centerBaseUrl: 'https://center.example.com',
      runnerBaseUrl: 'http://127.0.0.1:8718',
      accessToken: '',
      userId: '',
      clientSessionId: '',
      projectId: ''
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('HTTP 页面分别使用 Center 和 Runner 同源前缀', () => {
    stubPageLocation('http:', 'http://127.0.0.1:5178');

    expect(resolveApiUrl('/api/ai-delivery/projects')).toBe('/center-api/api/ai-delivery/projects');
    expect(resolveRunnerApiUrl('/api/ai-delivery/agents')).toBe('/runner-api/api/ai-delivery/agents');
  });

  it('已包含代理前缀时不会重复添加', () => {
    stubPageLocation('http:', 'http://127.0.0.1:5178');

    expect(resolveApiUrl('/center-api/api/ai-delivery/projects')).toBe('/center-api/api/ai-delivery/projects');
    expect(resolveRunnerApiUrl('/runner-api/api/ai-delivery/agents')).toBe('/runner-api/api/ai-delivery/agents');
  });

  it('HTTPS 页面将绝对 ticket 地址改写为同源 wss 地址', () => {
    stubPageLocation('https:', 'https://console.example.com');

    expect(resolveWebSocketUrl('wss://center.example.com/api/ai-delivery/ws')).toBe(
      'wss://console.example.com/center-api/api/ai-delivery/ws'
    );
  });

  it('HTTP 页面使用同源 ws 地址', () => {
    stubPageLocation('http:', 'http://127.0.0.1:5178');

    expect(resolveWebSocketUrl('/api/ai-delivery/ws')).toBe('ws://127.0.0.1:5178/center-api/api/ai-delivery/ws');
  });

  it('file 页面保留 Center、Runner 与 WebSocket 直连地址', () => {
    stubPageLocation('file:', 'null');

    expect(resolveApiUrl('/api/ai-delivery/projects')).toBe('https://center.example.com/api/ai-delivery/projects');
    expect(resolveRunnerApiUrl('/api/ai-delivery/agents')).toBe('http://127.0.0.1:8718/api/ai-delivery/agents');
    expect(resolveWebSocketUrl('/api/ai-delivery/ws')).toBe('wss://center.example.com/api/ai-delivery/ws');
  });
});
