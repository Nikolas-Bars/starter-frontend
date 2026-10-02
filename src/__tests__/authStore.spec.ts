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

  it('входит гостем по ссылке и забывает её при выходе', async () => {
    const fetchMock = mockFetchOnce(201, {
      ...authTokenResponse,
      data: { ...authTokenResponse.data, user: { ...authTokenResponse.data.user, is_guest: true } },
    })
    const auth = useAuthStore()

    await auth.joinAsGuest('aB3dE5fG7hJ9', 'Аркадий')

    expect(auth.isGuest).toBe(true)
    expect(auth.guestLinkCode).toBe('aB3dE5fG7hJ9')
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/call-links\/aB3dE5fG7hJ9\/join$/)

    mockFetchOnce(200, { status: 'success', message: '', data: null, errors: {} })
    await auth.logout()

    expect(auth.guestLinkCode).toBeNull()
    expect(localStorage.getItem('guest_link_code')).toBeNull()
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
