import { t } from '@/i18n'
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
      return t(outgoing ? 'chats.call.outgoing' : 'chats.call.incoming')
    case 'rejected':
      return t(outgoing ? 'chats.call.rejectedByPeer' : 'chats.call.rejectedByMe')
    case 'missed':
      return t(outgoing ? 'chats.call.noAnswer' : 'chats.call.missed')
    case 'busy':
      return t(outgoing ? 'chats.call.peerBusy' : 'chats.call.missed')
    case 'unavailable':
      return t(outgoing ? 'chats.call.peerOffline' : 'chats.call.missed')
  }
}

/** Одной строкой для превью в списке чатов: «Исходящий звонок, 1:05» */
export function callSummary(call: ChatMessageCall, outgoing: boolean): string {
  const title = callTitle(call, outgoing)
  return call.duration_seconds === null
    ? title
    : `${title}, ${formatDuration(call.duration_seconds)}`
}
