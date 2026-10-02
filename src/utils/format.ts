/** 75 → «1:15», 3725 → «1:02:05» */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

const shortDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const fullDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const dayWithYearFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

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
    return timeFormat.format(date)
  }
  return date.getFullYear() === now.getFullYear()
    ? shortDateFormat.format(date)
    : fullDateFormat.format(date)
}

/** Разделитель дней в переписке: «Сегодня», «Вчера», «2 октября», «2 октября 2025 г.» */
export function formatDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (isSameDay(date, now)) {
    return 'Сегодня'
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return 'Вчера'
  }
  return date.getFullYear() === now.getFullYear()
    ? dayFormat.format(date)
    : dayWithYearFormat.format(date)
}

/** Ключ дня для группировки сообщений */
export function dayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
