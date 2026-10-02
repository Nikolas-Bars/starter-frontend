import { http } from '@/api/http'
import type { Paginated, User } from '@/types/api'

export const usersApi = {
  list: (search = '', page = 1) => {
    const query = new URLSearchParams({ page: String(page) })
    if (search.trim() !== '') {
      query.set('search', search.trim())
    }
    return http.get<Paginated<User>>(`users?${query}`)
  },
}
