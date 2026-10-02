import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

/** Ключ также читает inline-скрипт в index.html, чтобы тема применилась до первой отрисовки */
const STORAGE_KEY = 'theme'

export type ThemePreference = 'system' | 'light' | 'dark'

function load(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

/** Тема оформления: системная или выбранная вручную; переживает перезагрузку страницы. */
export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(load())

  watch(
    preference,
    (value) => {
      const root = document.documentElement
      if (value === 'system') {
        localStorage.removeItem(STORAGE_KEY)
        delete root.dataset.theme
      } else {
        localStorage.setItem(STORAGE_KEY, value)
        root.dataset.theme = value
      }
    },
    { immediate: true },
  )

  return { preference }
})
