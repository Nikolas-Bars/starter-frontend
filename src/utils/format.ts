import { intlLocale, t } from '@/i18n'

/** 75 → «1:15», 3725 → «1:02:05» */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

const FORMATS = {
  dateTime: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit' },
  shortDate: { day: 'numeric', month: 'short' },
  fullDate: { day: '2-digit', month: '2-digit', year: 'numeric' },
  day: { day: 'numeric', month: 'long' },
  dayWithYear: { day: 'numeric', month: 'long', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Форматтер на текущем языке: создание дорогое, поэтому по одному на язык и формат */
function formatter(name: keyof typeof FORMATS): Intl.DateTimeFormat {
  const tag = intlLocale()
  const key = `${tag}:${name}`
  let format = formatters.get(key)
  if (format === undefined) {
    format = new Intl.DateTimeFormat(tag, FORMATS[name])
    formatters.set(key, format)
  }
  return format
}

export function formatDateTime(iso: string): string {
  return formatter('dateTime').format(new Date(iso))
}

export function formatTime(iso: string): string {
  return formatter('time').format(new Date(iso))
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Время в списке чатов: сегодня — «14:05», в этом году — «2 окт.», раньше — «02.10.2025» */
export function formatChatTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (isSameDay(date, now)) {
    return formatter('time').format(date)
  }
  return formatter(date.getFullYear() === now.getFullYear() ? 'shortDate' : 'fullDate').format(date)
}

/** Разделитель дней в переписке: «Сегодня», «Вчера», «2 октября», «2 октября 2025 г.» */
export function formatDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (isSameDay(date, now)) {
    return t('common.today')
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return t('common.yesterday')
  }
  return formatter(date.getFullYear() === now.getFullYear() ? 'day' : 'dayWithYear').format(date)
}

/** Ключ дня для группировки сообщений */
export function dayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
