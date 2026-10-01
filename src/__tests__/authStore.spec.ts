import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { authTokenResponse, mockFetchOnce } from './helpers'

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('сохраняет токен и пользователя после входа', async () => {
    const fetchMock = mockFetchOnce(200, authTokenResponse)
    const auth = useAuthStore()

    await auth.login({ email: 'admin@example.com', password: 'Password123' })

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.name).toBe('Администратор')
    expect(localStorage.getItem('access_token')).toBe('1|secret')
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/auth\/login$/)
  })

  it('пробрасывает ошибку бэкенда с текстом и ошибками полей', async () => {
    mockFetchOnce(422, {
      status: 'error',
      message: 'Проверьте правильность заполнения полей.',
      data: null,
      errors: { email: ['Такое значение поля «email» уже занято.'] },
    })
    const auth = useAuthStore()

    const error = await auth
      .register({ name: 'Иван', email: 'a@b.c', password: 'x', password_confirmation: 'x' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).errors.email?.[0]).toContain('уже занято')
    expect(auth.isAuthenticated).toBe(false)
  })

  it('сбрасывает протухший токен при загрузке пользователя', async () => {
    localStorage.setItem('access_token', 'expired')
    mockFetchOnce(401, {
      status: 'error',
      message: 'Необходимо авторизоваться.',
      data: null,
      errors: {},
    })
    const auth = useAuthStore()

    await auth.fetchUser()

    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('выходит локально, даже если бэкенд недоступен', async () => {
    localStorage.setItem('access_token', '1|secret')
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const auth = useAuthStore()

    await auth.logout().catch(() => undefined)

    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem('access_token')).toBeNull()
  })
})
