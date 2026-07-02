import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const supportedProfiles = new Set(['local', 'dev', 'prd']);
const require = createRequire(import.meta.url);
const { loadProfileEnv, resolveEnvProfile } = require('./scripts/env-loader.cjs') as {
  loadProfileEnv: (rootDir: string, options?: { profile?: string }) => void;
  resolveEnvProfile: (value?: string) => string;
};

function profileForMode(mode: string): string {
  if (process.env.AI_DELIVERY_ENV) {
    return resolveEnvProfile();
  }
  return supportedProfiles.has(mode) ? mode : 'local';
}

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envList(value: string | undefined, fallback: string[]): string[] {
  const list = (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

export default defineConfig(({ mode }) => {
  const profile = profileForMode(mode);
  loadProfileEnv(process.cwd(), { profile });
  const env = process.env;
  const devPort = envNumber(env.VITE_AI_DELIVERY_DEV_PORT, 5178);
  const previewPort = envNumber(env.VITE_AI_DELIVERY_PREVIEW_PORT, 4178);
  const centerTarget = env.VITE_AI_DELIVERY_CENTER_BASE_URL || 'http://127.0.0.1:8728';
  const runnerTarget = env.VITE_AI_DELIVERY_RUNNER_BASE_URL || 'http://127.0.0.1:8718';
  const proxy = {
    '/runner-api': {
      target: runnerTarget,
      changeOrigin: true,
      rewrite: (pathname: string) => pathname.replace(/^\/runner-api/, '')
    },
    '/center-api': {
      target: centerTarget,
      changeOrigin: true,
      ws: true,
      rewrite: (pathname: string) => pathname.replace(/^\/center-api/, '')
    }
  };

  return {
    base: './',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url))
      }
    },
    server: {
      port: devPort,
      host: true,
      proxy,
      allowedHosts: envList(env.VITE_AI_DELIVERY_ALLOWED_HOSTS, ['webcams-southwest-substantially-neon.trycloudflare.com','127.0.0.1', 'localhost'])
    },
    preview: {
      port: previewPort,
      host: true,
      proxy
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './tests/setup.ts'
    }
  };
});
