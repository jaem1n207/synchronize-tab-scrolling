/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly __WATCH__: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
