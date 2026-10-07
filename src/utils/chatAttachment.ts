import { intlLocale, t } from '@/i18n'
import type { ChatAttachmentKind, ChatMessage } from '@/types/api'
import { displayBody } from '@/utils/chatTranslation'

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

const SIZE_UNITS = ['b', 'kb', 'mb', 'gb'] as const

/** 1536 → «1,5 КБ» */
export function formatFileSize(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  const number = new Intl.NumberFormat(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value)
  return `${number} ${t(`units.${SIZE_UNITS[unit]!}`)}`
}

function kindLabel(kind: ChatAttachmentKind): string {
  return t(`chats.attachments.kind.${kind}`)
}

/**
 * Превью сообщения в списке чатов: подпись или текст (переведённый, если есть), а без них — что за файлы
 */
export function messagePreview(
  message: Pick<ChatMessage, 'body' | 'attachments'> &
    Partial<Pick<ChatMessage, 'body_locale' | 'translations'>>,
): string {
  const attachments = message.attachments ?? []
  const body = displayBody(message)
  if (attachments.length === 0) {
    return body === '' ? t('chats.attachments.removed') : body
  }

  const first = attachments[0]!
  const sameKind = attachments.every((attachment) => attachment.kind === first.kind)
  let label: string
  if (attachments.length === 1) {
    label = first.kind === 'file' ? first.name : kindLabel(first.kind)
  } else {
    label =
      sameKind && first.kind !== 'file'
        ? t('chats.attachments.kindCount', {
            kind: kindLabel(first.kind),
            count: attachments.length,
          })
        : t('chats.attachments.files', { count: attachments.length })
  }

  return body === '' ? label : `${label} · ${body}`
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
