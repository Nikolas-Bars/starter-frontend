import type { ChatAttachmentKind, ChatMessage } from '@/types/api'

/** Совпадает с лимитами бэкенда (config/attachments.php) */
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_FILES_PER_MESSAGE = 10

/** Фото, которые сервер сжимает; остальные картинки (SVG и т. п.) уходят обычным файлом */
const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]

/**
 * Как файл будет показан, пока он загружается. Окончательно тип определяет сервер по содержимому
 */
export function guessKind(file: File, asFile = false): ChatAttachmentKind {
  if (asFile) {
    return 'file'
  }
  if (IMAGE_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    return 'image'
  }
  return file.type.startsWith('video/') ? 'video' : 'file'
}

/** 1536 → «1,5 КБ» */
export function formatFileSize(bytes: number): string {
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`
}

const KIND_LABELS: Record<ChatAttachmentKind, string> = {
  image: 'Фото',
  video: 'Видео',
  voice: 'Голосовое сообщение',
  file: 'Файл',
}

/**
 * Превью сообщения в списке чатов: подпись или текст, а без них — что за файлы
 */
export function messagePreview(message: Pick<ChatMessage, 'body' | 'attachments'>): string {
  const attachments = message.attachments ?? []
  if (attachments.length === 0) {
    return message.body === '' ? 'Файл удалён' : message.body
  }

  const first = attachments[0]!
  const sameKind = attachments.every((attachment) => attachment.kind === first.kind)
  let label: string
  if (attachments.length === 1) {
    label = first.kind === 'file' ? first.name : KIND_LABELS[first.kind]
  } else {
    label =
      sameKind && first.kind !== 'file'
        ? `${KIND_LABELS[first.kind]}: ${attachments.length}`
        : `Файлы: ${attachments.length}`
  }

  return message.body === '' ? label : `${label} · ${message.body}`
}

export function attachmentIcon(kind: ChatAttachmentKind): 'image' | 'video' | 'mic' | 'file' {
  switch (kind) {
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'voice':
      return 'mic'
    default:
      return 'file'
  }
}
