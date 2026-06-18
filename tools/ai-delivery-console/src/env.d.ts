/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_DELIVERY_CENTER_BASE_URL?: string;
  readonly VITE_AI_DELIVERY_RUNNER_BASE_URL?: string;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module 'markdown-it-mermaid' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}
