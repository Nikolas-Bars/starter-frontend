import { http } from '@/api/http'
import type { AuthToken, LoginPayload, RegisterPayload, User } from '@/types/api'

export const authApi = {
  login: (payload: LoginPayload) => http.post<AuthToken>('auth/login', payload),
  register: (payload: RegisterPayload) => http.post<AuthToken>('auth/register', payload),
  logout: () => http.post<null>('auth/logout'),
  me: () => http.get<User>('auth/me'),
}
