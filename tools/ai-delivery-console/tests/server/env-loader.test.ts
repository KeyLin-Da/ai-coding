import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { loadProfileEnv, parseEnvText, resolveEnvProfile } = require('../../scripts/env-loader.cjs') as {
  loadProfileEnv: (rootDir: string, options?: { profile?: string; override?: boolean } | string) => {
    profile: string;
    loadedFiles: string[];
    values: Record<string, string>;
  };
  parseEnvText: (text: string) => Record<string, string>;
  resolveEnvProfile: (value?: string) => string;
};

const touchedEnvKeys = [
  'AI_DELIVERY_ENV',
  'VITE_AI_DELIVERY_PORT',
  'VITE_AI_DELIVERY_CENTER_BASE_URL',
  'VITE_AI_DELIVERY_RUNNER_BASE_URL',
  'CUSTOM_VALUE'
];
const originalEnv = new Map<string, string | undefined>();

describe('env-loader', () => {
  beforeEach(() => {
    for (const key of touchedEnvKeys) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of touchedEnvKeys) {
      const original = originalEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
    originalEnv.clear();
  });

  it('解析基础 env 语法并忽略注释', () => {
    expect(
      parseEnvText(`
        # comment
        VITE_AI_DELIVERY_PORT=8718
        export CUSTOM_VALUE="hello"
        EMPTY=
      `)
    ).toEqual({
      VITE_AI_DELIVERY_PORT: '8718',
      CUSTOM_VALUE: 'hello',
      EMPTY: ''
    });
  });

  it('按 profile 分层加载 env 文件，profile 覆盖公共值且不覆盖 shell 显式变量', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-delivery-env-'));
    await fs.writeFile(path.join(tempDir, '.env'), 'VITE_AI_DELIVERY_PORT=8718\nCUSTOM_VALUE=base\n', 'utf8');
    await fs.writeFile(
      path.join(tempDir, '.env.dev'),
      'VITE_AI_DELIVERY_CENTER_BASE_URL=https://dev-center.example.com\nVITE_AI_DELIVERY_PORT=9001\n',
      'utf8'
    );
    process.env.AI_DELIVERY_ENV = 'dev';
    process.env.VITE_AI_DELIVERY_PORT = '9999';

    const result = loadProfileEnv(tempDir);

    expect(result.profile).toBe('dev');
    expect(result.loadedFiles.map((file) => path.basename(file))).toEqual(['.env', '.env.dev']);
    expect(process.env.VITE_AI_DELIVERY_PORT).toBe('9999');
    expect(process.env.VITE_AI_DELIVERY_CENTER_BASE_URL).toBe('https://dev-center.example.com');
    expect(process.env.CUSTOM_VALUE).toBe('base');
  });

  it('未知 profile 回退到 local', () => {
    expect(resolveEnvProfile('staging')).toBe('local');
  });
});
