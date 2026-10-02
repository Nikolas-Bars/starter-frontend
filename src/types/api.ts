/** Единый формат ответа бэкенда: { status, message, data, errors } */
export interface ApiResponse<T> {
  status: 'success' | 'error'
  message: string
  data: T
  errors: ValidationErrors
}

/** Ошибки валидации: поле => список сообщений */
export type ValidationErrors = Record<string, string[]>

export interface User {
  id: number
  name: string
  email: string
  email_verified_at: string | null
  created_at: string | null
}

/** Страница списка: GET /api/users, GET /api/calls */
export interface Paginated<T> {
  items: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export type CallStatus =
  'ringing' | 'active' | 'rejected' | 'missed' | 'busy' | 'unavailable' | 'ended'

export interface Call {
  id: number
  status: CallStatus
  caller: User
  callee: User
  started_at: string
  answered_at: string | null
  ended_at: string | null
  /** Длительность разговора; null, если не ответили */
  duration_seconds: number | null
}

/** Элемент RTCConfiguration.iceServers из GET /api/calls/ice-servers */
export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

export interface AuthToken {
  access_token: string
  token_type: 'Bearer'
  expires_at: string | null
  user: User
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirmation: string
}
