import { watch } from 'vue'
import { createI18n, type PluralizationRule } from 'vue-i18n'

import { DEFAULT_LOCALE, locale, type Locale } from './locale'
import ru from './locales/ru.json'
import vi from './locales/vi.json'

export type MessageSchema = typeof ru

/** «chats.message.copy» и т. п.: все строки ru.json, опечатка в ключе — ошибка type-check */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type MessageKey = Leaves<MessageSchema>
/** Теги для Intl: от них зависят названия месяцев и порядок частей даты */
export const INTL_LOCALES: Record<Locale, string> = {
  ru: 'ru-RU',
  vi: 'vi-VN',
}

const PLURAL_FORMS: Intl.LDMLPluralRule[] = ['one', 'few', 'many']

/**
 * Формы в сообщении идут через «|» в порядке one | few | many («звонок | звонка | звонков»).
 * Без этого правила vue-i18n выбирает форму по-английски и пишет «5 звонка».
 */
const russianPlural: PluralizationRule = (choice, choicesLength) => {
  const index = PLURAL_FORMS.indexOf(new Intl.PluralRules('ru').select(Math.abs(choice)))
  return Math.min(index === -1 ? PLURAL_FORMS.length - 1 : index, choicesLength - 1)
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: locale.value,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ru, vi },
  pluralRules: { ru: russianPlural },
  missingWarn: false,
  fallbackWarn: false,
})

// sync: текст, собранный сразу после setLocale (ошибка, заголовок вкладки), уже на новом языке
watch(
  locale,
  (value) => {
    i18n.global.locale.value = value
  },
  { flush: 'sync' },
)

/**
 * Перевод по ключу. Подходит и для шаблонов (перерисуются при смене языка),
 * и для сторов — там текст собирается в момент вызова.
 * Число вторым аргументом выбирает форму множественного числа и доступно в тексте как {n}.
 */
export function t(key: MessageKey, values?: Record<string, unknown> | number): string {
  return typeof values === 'number' ? i18n.global.t(key, values) : i18n.global.t(key, values ?? {})
}

export function intlLocale(): string {
  return INTL_LOCALES[locale.value]
}
