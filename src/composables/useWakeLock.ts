import { onScopeDispose, watch, type Ref } from 'vue'

/**
 * Не даёт экрану погаснуть, пока active = true. Браузер снимает блокировку, когда вкладку
 * сворачивают, — при возвращении берём её снова. Без поддержки Wake Lock API ничего не делает.
 */
export function useWakeLock(active: Readonly<Ref<boolean>>): void {
  let sentinel: WakeLockSentinel | null = null

  async function acquire(): Promise<void> {
    if (sentinel !== null || !('wakeLock' in navigator) || document.visibilityState !== 'visible') {
      return
    }
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => (sentinel = null))
      if (!active.value) {
        await release()
      }
    } catch {
      sentinel = null
    }
  }

  async function release(): Promise<void> {
    const current = sentinel
    sentinel = null
    await current?.release().catch(() => undefined)
  }

  function onVisibilityChange(): void {
    if (active.value) {
      void acquire()
    }
  }

  watch(
    active,
    (isActive) => {
      void (isActive ? acquire() : release())
    },
    { immediate: true },
  )

  document.addEventListener('visibilitychange', onVisibilityChange)

  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void release()
  })
}
