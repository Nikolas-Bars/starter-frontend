/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес бэкенда без завершающего слэша, например http://localhost:8090 */
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
