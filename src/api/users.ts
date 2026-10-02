import { http } from '@/api/http'
import type { Paginated, UpdateProfilePayload, User } from '@/types/api'

export const usersApi = {
  /** Поиск по имени, email или нику (можно с @) */
  list: (search = '', page = 1) => {
    const query = new URLSearchParams({ page: String(page) })
    if (search.trim() !== '') {
      query.set('search', search.trim())
    }
    return http.get<Paginated<User>>(`users?${query}`)
  },
  updateProfile: (payload: UpdateProfilePayload) => http.patch<User>('profile', payload),
}
