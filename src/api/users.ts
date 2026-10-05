import { http } from '@/api/http'
import type { Paginated, UpdateProfilePayload, User } from '@/types/api'

export const usersApi = {
  /** Поиск по части ника (можно с @) */
  list: (search = '', page = 1) => {
    const query = new URLSearchParams({ page: String(page) })
    if (search.trim() !== '') {
      query.set('search', search.trim())
    }
    return http.get<Paginated<User>>(`users?${query}`)
  },
  updateProfile: (payload: UpdateProfilePayload) => http.patch<User>('profile', payload),
  /** Сервер обрежет фото до квадрата 512×512 */
  updateAvatar: (file: File) => {
    const form = new FormData()
    form.append('avatar', file)
    return http.post<User>('profile/avatar', form)
  },
  deleteAvatar: () => http.delete<User>('profile/avatar'),
}
