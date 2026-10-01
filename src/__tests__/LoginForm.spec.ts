import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import LoginForm from '@/components/auth/LoginForm.vue'
import { authTokenResponse, mockFetchOnce } from './helpers'

describe('LoginForm', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('отправляет email и пароль и сообщает об успехе', async () => {
    const fetchMock = mockFetchOnce(200, authTokenResponse)
    const wrapper = mount(LoginForm)

    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('Password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({ email: 'admin@example.com', password: 'Password123' })
    expect(wrapper.emitted('success')).toHaveLength(1)
  })

  it('показывает ошибку неверных данных', async () => {
    mockFetchOnce(401, {
      status: 'error',
      message: 'Неверный email или пароль.',
      data: null,
      errors: {},
    })
    const wrapper = mount(LoginForm)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Неверный email или пароль.')
    expect(wrapper.emitted('success')).toBeUndefined()
  })
})
