import { describe, expect, it } from 'vitest'

import type { ChatAttachment } from '@/types/api'
import { formatFileSize, guessKind, messagePreview } from '@/utils/chatAttachment'

function attachment(kind: ChatAttachment['kind'], name = 'file.bin'): ChatAttachment {
  return {
    id: 1,
    kind,
    status: 'ready',
    name,
    mime: 'application/octet-stream',
    size: 1,
    width: null,
    height: null,
    duration_ms: null,
    waveform: null,
    url: null,
    thumb_url: null,
  }
}

describe('chatAttachment', () => {
  it('пишет размер по-русски', () => {
    expect(formatFileSize(512)).toBe('512 Б')
    expect(formatFileSize(1536)).toBe('1,5 КБ')
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 МБ')
  })

  it('угадывает, как показать файл, пока он загружается', () => {
    expect(guessKind(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe('image')
    expect(guessKind(new File([], 'IMG_1.HEIC'))).toBe('image')
    expect(guessKind(new File([], 'a.svg', { type: 'image/svg+xml' }))).toBe('file')
    expect(guessKind(new File([], 'a.mov', { type: 'video/quicktime' }))).toBe('video')
    expect(guessKind(new File([], 'a.jpg', { type: 'image/jpeg' }), true)).toBe('file')
  })

  it('описывает файлы в списке чатов', () => {
    expect(messagePreview({ body: 'Привет', attachments: [] })).toBe('Привет')
    expect(messagePreview({ body: '', attachments: [] })).toBe('Файл удалён')
    expect(messagePreview({ body: '', attachments: [attachment('image')] })).toBe('Фото')
    expect(
      messagePreview({ body: 'Море', attachments: [attachment('image'), attachment('image')] }),
    ).toBe('Фото: 2 · Море')
    expect(messagePreview({ body: '', attachments: [attachment('file', 'отчёт.pdf')] })).toBe(
      'отчёт.pdf',
    )
    expect(messagePreview({ body: '', attachments: [attachment('voice')] })).toBe(
      'Голосовое сообщение',
    )
    expect(
      messagePreview({ body: '', attachments: [attachment('image'), attachment('file')] }),
    ).toBe('Файлы: 2')
  })
})
