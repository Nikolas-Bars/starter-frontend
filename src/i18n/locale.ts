import { readonly, ref } from 'vue'

/**
 * Языки интерфейса. Новый язык — код здесь (он же должен быть в app.supported_locales бэкенда).
 * Первый — язык по умолчанию.
 */
export const SUPPORTED_LOCALES = ['ru', 'vi'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = SUPPORTED_LOCALES[0]

const STORAGE_KEY = 'locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** До входа: выбранный раньше язык, затем язык браузера («vi-VN» → «vi») */
function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (isLocale(saved)) {
    return saved
  }

  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base)) {
      return base
    }
  }

  return DEFAULT_LOCALE
}

const current = ref<Locale>(detectLocale())
document.documentElement.lang = current.value

/** Текущий язык интерфейса; с ним уходят запросы к API (Accept-Language) */
export const locale = readonly(current)

/** После входа язык берётся из профиля (users.locale): он общий для всех устройств */
export function setLocale(value: Locale): void {
  current.value = value
  localStorage.setItem(STORAGE_KEY, value)
  document.documentElement.lang = value
}
