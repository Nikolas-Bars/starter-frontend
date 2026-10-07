import { onScopeDispose, ref, watch } from 'vue'

import { t } from '@/i18n'
import { useCallStore } from '@/stores/call'

const TITLE_BLINK_MS = 1000

export type NotificationPermissionState = NotificationPermission | 'unsupported'

function currentPermission(): NotificationPermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/**
 * Делает звонок заметным, когда пользователь смотрит не на вкладку: заголовок вкладки мигает
 * на входящем и показывает число пропущенных, а в фоне приходит системное уведомление.
 */
export function useCallAttention(): void {
  const callStore = useCallStore()

  const baseTitle = document.title
  let blinkOn = false
  let blinkTimer: ReturnType<typeof setInterval> | null = null
  let notification: Notification | null = null

  function renderTitle(): void {
    const name = callStore.counterpart?.name ?? ''
    const missed = callStore.missedCount > 0 ? `(${callStore.missedCount}) ` : ''
    document.title = blinkOn ? t('calls.incomingFrom', { name }) : `${missed}${baseTitle}`
  }

  function stopBlink(): void {
    if (blinkTimer !== null) {
      clearInterval(blinkTimer)
      blinkTimer = null
    }
    blinkOn = false
  }

  function closeNotification(): void {
    notification?.close()
    notification = null
  }

  function notifyIncoming(): void {
    if (!document.hidden || currentPermission() !== 'granted') {
      return
    }

    notification = new Notification(t('calls.incoming'), {
      body: callStore.counterpart?.name ?? '',
      tag: 'incoming-call',
      requireInteraction: true,
    })
    notification.onclick = () => {
      window.focus()
      closeNotification()
    }
  }

  watch(
    () => callStore.phase === 'incoming',
    (incoming) => {
      stopBlink()
      closeNotification()

      if (incoming) {
        blinkTimer = setInterval(() => {
          blinkOn = !blinkOn
          renderTitle()
        }, TITLE_BLINK_MS)
        notifyIncoming()
      }
      renderTitle()
    },
  )

  watch(() => callStore.missedCount, renderTitle, { immediate: true })

  onScopeDispose(() => {
    stopBlink()
    closeNotification()
    document.title = baseTitle
  })
}

/** Разрешение на системные уведомления о входящих, когда вкладка в фоне. */
export function useNotificationPermission() {
  const permission = ref<NotificationPermissionState>(currentPermission())

  /** Браузеры разрешают спросить только в ответ на действие пользователя — вызывать по клику */
  async function requestPermission(): Promise<void> {
    if (permission.value === 'unsupported') {
      return
    }
    permission.value = await Notification.requestPermission()
  }

  return { permission, requestPermission }
}
