import { computed, onScopeDispose, watch } from 'vue'

import { CallSounds, type CallSound } from '@/realtime/callSounds'
import { useCallStore } from '@/stores/call'
import { useCallSettingsStore } from '@/stores/callSettings'

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

/**
 * Озвучивает звонок: трель на входящий, длинные гудки, пока ждём ответа, короткие — по завершении.
 * В режиме «без звука» молчит только трель входящего.
 */
export function useCallSounds(): void {
  const callStore = useCallStore()
  const settings = useCallSettingsStore()
  const sounds = new CallSounds()

  const sound = computed<CallSound | null>(() => {
    switch (callStore.phase) {
      case 'incoming':
        return settings.ringtoneMuted ? null : 'incoming'
      // Гудки — только когда сервер подтвердил, что у собеседника звонит
      case 'outgoing':
        return callStore.call === null ? null : 'outgoing'
      case 'ended':
        return 'ended'
      default:
        return null
    }
  })

  watch(sound, (current) => {
    if (current === null) {
      sounds.stop()
    } else {
      sounds.play(current)
    }
  })

  const unlock = () => sounds.unlock()
  UNLOCK_EVENTS.forEach((event) => window.addEventListener(event, unlock, { capture: true }))

  onScopeDispose(() => {
    sounds.stop()
    UNLOCK_EVENTS.forEach((event) => window.removeEventListener(event, unlock, { capture: true }))
  })
}
