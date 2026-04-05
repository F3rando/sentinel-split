/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production: full FastAPI origin, e.g. https://xxx.up.railway.app (set in Vercel, then rebuild). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
