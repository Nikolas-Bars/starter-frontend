import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'call_settings'

interface StoredSettings {
  ringtoneMuted: boolean
  audioInputId: string | null
  videoInputId: string | null
  audioOutputId: string | null
}

const DEFAULTS: StoredSettings = {
  ringtoneMuted: false,
  audioInputId: null,
  videoInputId: null,
  audioOutputId: null,
}

function load(): StoredSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return typeof stored === 'object' && stored !== null ? { ...DEFAULTS, ...stored } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

/** Предпочтения пользователя для звонков; переживают перезагрузку страницы. */
export const useCallSettingsStore = defineStore('callSettings', () => {
  const initial = load()

  /** Входящий звонит без звука: остаются окно вызова, уведомление и мигающий заголовок */
  const ringtoneMuted = ref(initial.ringtoneMuted)
  const audioInputId = ref(initial.audioInputId)
  const videoInputId = ref(initial.videoInputId)
  const audioOutputId = ref(initial.audioOutputId)

  watch([ringtoneMuted, audioInputId, videoInputId, audioOutputId], () => {
    const settings: StoredSettings = {
      ringtoneMuted: ringtoneMuted.value,
      audioInputId: audioInputId.value,
      videoInputId: videoInputId.value,
      audioOutputId: audioOutputId.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  })

  return { ringtoneMuted, audioInputId, videoInputId, audioOutputId }
})
