import type { ApiResponse, ValidationErrors } from '@/types/api'
import { tokenStorage } from '@/api/tokenStorage'
import { t } from '@/i18n'
import { locale } from '@/i18n/locale'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: ValidationErrors = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** Полный адрес для относительной ссылки от API (например, url вложения: /api/files/…) */
export function apiUrl(path: string): string {
  return `${baseUrl}${path}`
}

/**
 * Запрос к API: подставляет Bearer-токен и разворачивает ответ до поля data.
 * Любой ответ не из диапазона 2xx превращается в ApiError с текстом от бэкенда.
 */
export async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': locale.value,
  }

  // Для FormData границу multipart подставит сам браузер
  const form = body instanceof FormData
  if (body !== undefined && !form) {
    headers['Content-Type'] = 'application/json'
  }

  const token = tokenStorage.get()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/${path.replace(/^\/+/, '')}`, {
      method,
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(t('errors.network'), 0)
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

  if (!response.ok || payload === null) {
    throw new ApiError(
      payload?.message || t('errors.requestFailed', { status: response.status }),
      response.status,
      payload?.errors ?? {},
    )
  }

  return payload.data
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
