import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authApi } from '@/api/auth'
import { ApiError } from '@/api/http'
import { tokenStorage } from '@/api/tokenStorage'
import type { AuthToken, LoginPayload, RegisterPayload, User } from '@/types/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(tokenStorage.get())

  const isAuthenticated = computed(() => token.value !== null)

  function applyToken(auth: AuthToken): void {
    tokenStorage.set(auth.access_token)
    token.value = auth.access_token
    user.value = auth.user
  }

  function reset(): void {
    tokenStorage.clear()
    token.value = null
    user.value = null
  }

  async function login(payload: LoginPayload): Promise<void> {
    applyToken(await authApi.login(payload))
  }

  async function register(payload: RegisterPayload): Promise<void> {
    applyToken(await authApi.register(payload))
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

  return { user, token, isAuthenticated, login, register, fetchUser, logout }
})
