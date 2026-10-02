import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authApi } from '@/api/auth'
import { callLinksApi } from '@/api/callLinks'
import { ApiError } from '@/api/http'
import { tokenStorage } from '@/api/tokenStorage'
import type { AuthToken, LoginPayload, RegisterPayload, User } from '@/types/api'

/** По какой ссылке вошёл гость: на чужой ссылке его вход не годится */
const GUEST_LINK_KEY = 'guest_link_code'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(tokenStorage.get())
  const guestLinkCode = ref<string | null>(localStorage.getItem(GUEST_LINK_KEY))

  const isAuthenticated = computed(() => token.value !== null)
  const isGuest = computed(() => user.value?.is_guest === true)

  function applyToken(auth: AuthToken): void {
    tokenStorage.set(auth.access_token)
    token.value = auth.access_token
    user.value = auth.user
  }

  function reset(): void {
    tokenStorage.clear()
    localStorage.removeItem(GUEST_LINK_KEY)
    token.value = null
    user.value = null
    guestLinkCode.value = null
  }

  async function login(payload: LoginPayload): Promise<void> {
    applyToken(await authApi.login(payload))
  }

  async function register(payload: RegisterPayload): Promise<void> {
    applyToken(await authApi.register(payload))
  }

  /** Вход гостем по ссылке для звонка: позвонить можно только её владельцу */
  async function joinAsGuest(code: string, name: string): Promise<void> {
    applyToken(await callLinksApi.join(code, { name }))
    localStorage.setItem(GUEST_LINK_KEY, code)
    guestLinkCode.value = code
  }

  /** Загружает пользователя по сохранённому токену; протухший токен сбрасывается. */
  async function fetchUser(): Promise<void> {
    if (!token.value || user.value) {
      return
    }

    try {
      user.value = await authApi.me()
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        reset()
        return
      }
      throw error
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      // Даже если бэкенд недоступен, локально пользователь должен выйти
      reset()
    }
  }

  return {
    user,
    token,
    guestLinkCode,
    isAuthenticated,
    isGuest,
    login,
    register,
    joinAsGuest,
    fetchUser,
    logout,
  }
})
