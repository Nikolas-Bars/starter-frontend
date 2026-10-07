import { locale } from '@/i18n/locale'
import type { ChatMessage } from '@/types/api'

type Translatable = Pick<ChatMessage, 'body'> &
  Partial<Pick<ChatMessage, 'body_locale' | 'translations'>>

/**
 * Перевод текста на язык интерфейса; null — показывать оригинал (уже на нашем языке,
 * перевод ещё не пришёл или переводчик выключен)
 */
export function translatedBody(message: Translatable, into: string = locale.value): string | null {
  if (message.body === '' || message.body_locale === into) {
    return null
  }
  // По WebSocket пустые переводы приходят массивом: читаем только по ключу и проверяем тип
  const text = (message.translations as Record<string, unknown> | undefined)?.[into]
  return typeof text === 'string' && text !== '' ? text : null
}

/** Текст, который видит читатель: перевод, если он есть, иначе оригинал */
export function displayBody(message: Translatable, into: string = locale.value): string {
  return translatedBody(message, into) ?? message.body
}
