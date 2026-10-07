import { describe, expect, it } from 'vitest'

import { messagePreview } from '@/utils/chatAttachment'
import { displayBody, translatedBody } from '@/utils/chatTranslation'

describe('chatTranslation', () => {
  const message = { body: 'Con ổn ạ', body_locale: 'vi', translations: { ru: 'Всё хорошо' } }

  it('показывает перевод на язык интерфейса', () => {
    expect(translatedBody(message, 'ru')).toBe('Всё хорошо')
    expect(displayBody(message, 'ru')).toBe('Всё хорошо')
  })

  it('без перевода или на языке оригинала — оригинал', () => {
    expect(translatedBody(message, 'vi')).toBeNull()
    expect(displayBody({ ...message, translations: {} }, 'ru')).toBe('Con ổn ạ')
    expect(displayBody({ body: 'Привет' }, 'ru')).toBe('Привет')
  })

  it('пустые переводы из WebSocket приходят массивом', () => {
    const fromSocket = { ...message, translations: [] as unknown as Record<string, string> }
    expect(translatedBody(fromSocket, 'ru')).toBeNull()
  })

  it('превью в списке чатов — тоже перевод', () => {
    expect(messagePreview({ ...message, attachments: [] })).toBe(displayBody(message))
  })
})
