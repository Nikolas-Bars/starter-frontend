import { vi } from 'vitest'

/** Подменяет fetch одним ответом в формате бэкенда. */
export function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

export const authTokenResponse = {
  status: 'success',
  message: 'Вход выполнен.',
  errors: {},
  data: {
    access_token: '1|secret',
    token_type: 'Bearer',
    expires_at: null,
    user: {
      id: 1,
      name: 'Администратор',
      email: 'admin@example.com',
      email_verified_at: null,
      created_at: null,
      is_guest: false,
    },
  },
}
