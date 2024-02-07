/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly __WATCH__: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
