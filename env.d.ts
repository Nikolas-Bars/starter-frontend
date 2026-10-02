/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес бэкенда без завершающего слэша, например http://localhost:8090 */
  readonly VITE_API_URL: string
  /** Адрес WebSocket-сервера звонков, например ws://localhost:8091 */
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
