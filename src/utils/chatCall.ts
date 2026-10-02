import type { ChatMessageCall } from '@/types/api'
import { formatDuration } from '@/utils/format'

/** Звонок, который собеседник не застал: занят, не в сети или не ответил */
export function isMissedCall(call: ChatMessageCall, outgoing: boolean): boolean {
  return !outgoing && call.status !== 'ended' && call.status !== 'rejected'
}

/** Заголовок служебного сообщения о звонке с точки зрения того, кто его читает */
export function callTitle(call: ChatMessageCall, outgoing: boolean): string {
  switch (call.status) {
    case 'ended':
      return outgoing ? 'Исходящий звонок' : 'Входящий звонок'
    case 'rejected':
      return outgoing ? 'Звонок отклонён' : 'Вы отклонили звонок'
    case 'missed':
      return outgoing ? 'Без ответа' : 'Пропущенный звонок'
    case 'busy':
      return outgoing ? 'Собеседник был занят' : 'Пропущенный звонок'
    case 'unavailable':
      return outgoing ? 'Собеседник был не в сети' : 'Пропущенный звонок'
  }
}

/** Одной строкой для превью в списке чатов: «Исходящий звонок, 1:05» */
export function callSummary(call: ChatMessageCall, outgoing: boolean): string {
  const title = callTitle(call, outgoing)
  return call.duration_seconds === null ? title : `${title}, ${formatDuration(call.duration_seconds)}`
}
