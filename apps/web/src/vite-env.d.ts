/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** cespk-api Data API scope, e.g. api://<API_APPID>/access_as_user */
  readonly VITE_API_SCOPE: string;
  /** cespk-spa Application (client) ID */
  readonly VITE_ENTRA_CLIENT_ID: string;
  /** Workforce tenant id */
  readonly VITE_ENTRA_TENANT_ID: string;
  /** BFF API origin, e.g. https://cespk-api-dev.azurewebsites.net */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
