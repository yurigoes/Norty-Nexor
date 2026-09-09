/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base da API. Em produção é `/api/v1` no mesmo domínio — não há host
   * separado para a API (`docs/11-infra.md`, seção 4).
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
