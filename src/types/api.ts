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
