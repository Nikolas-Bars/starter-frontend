import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { locale, setLocale } from '@/i18n/locale'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types/api'
import ProfileView from '@/views/ProfileView.vue'
import { authTokenResponse, mockFetchOnce } from './helpers'

const user: User = { ...authTokenResponse.data.user, avatar_url: null }

function mountProfile() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chats', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
  return mount(ProfileView, { global: { plugins: [router] } })
}

describe('ProfileView: язык', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    setLocale('ru')
    useAuthStore().setUser({ ...user })
  })

  it('сохраняет выбранный язык в профиле и переключается на него', async () => {
    const fetchMock = mockFetchOnce(200, {
      status: 'success',
      message: 'Đã lưu ngôn ngữ.',
      errors: {},
      data: { ...user, locale: 'vi' },
    })
    const wrapper = mountProfile()

    const vietnamese = wrapper.find('[role="radio"][lang="vi"]')
    expect(vietnamese.text()).toBe('Tiếng Việt')
    await vietnamese.trigger('click')
    await flushPromises()

    expect(String(fetchMock.mock.lastCall?.[0])).toContain('profile/locale')
    expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))).toEqual({ locale: 'vi' })
    expect(locale.value).toBe('vi')
    expect(vietnamese.attributes('aria-checked')).toBe('true')
  })

  it('при ошибке остаётся на прежнем языке и показывает её', async () => {
    mockFetchOnce(500, { status: 'error', message: 'Ошибка сервера.', data: null, errors: {} })
    const wrapper = mountProfile()

    await wrapper.find('[role="radio"][lang="vi"]').trigger('click')
    await flushPromises()

    expect(locale.value).toBe('ru')
    expect(wrapper.find('[role="alert"]').text()).toBe('Ошибка сервера.')
  })
})
