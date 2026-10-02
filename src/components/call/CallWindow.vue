<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch, watchEffect } from 'vue'

import CallChat from '@/components/call/CallChat.vue'
import CallDevices from '@/components/call/CallDevices.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useWakeLock } from '@/composables/useWakeLock'
import { useCallStore } from '@/stores/call'
import { useCallSettingsStore } from '@/stores/callSettings'
import { formatDuration } from '@/utils/format'

type Panel = 'chat' | 'devices' | null

const callStore = useCallStore()
const settings = useCallSettingsStore()

const root = useTemplateRef<HTMLDivElement>('root')
const localVideo = useTemplateRef<HTMLVideoElement>('localVideo')
const remoteVideo = useTemplateRef<HTMLVideoElement>('remoteVideo')
const chat = useTemplateRef<InstanceType<typeof CallChat>>('chat')

const visible = computed(() => callStore.phase !== 'idle' && callStore.phase !== 'incoming')
const inCall = computed(() => visible.value && callStore.phase !== 'ended')

const panel = ref<Panel>(null)
const swapped = ref(false)
const fullscreen = ref(false)

const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
const canPictureInPicture = typeof document !== 'undefined' && document.pictureInPictureEnabled

useWakeLock(computed(() => callStore.phase === 'active'))

watchEffect(() => {
  if (localVideo.value) {
    localVideo.value.srcObject = callStore.localStream
  }
})

watchEffect(() => {
  if (remoteVideo.value) {
    remoteVideo.value.srcObject = callStore.remoteStream
  }
})

watchEffect(() => {
  const video = remoteVideo.value
  const sinkId = settings.audioOutputId
  if (video && sinkId !== null && 'setSinkId' in video) {
    void video.setSinkId(sinkId).catch(() => undefined)
  }
})

watch(inCall, (isInCall) => {
  if (!isInCall) {
    panel.value = null
    swapped.value = false
  }
})

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

watch(
  () => callStore.activeSince,
  (since) => {
    if (clock !== null) {
      clearInterval(clock)
      clock = null
    }
    if (since !== null) {
      now.value = Date.now()
      clock = setInterval(() => (now.value = Date.now()), 1000)
    }
  },
  { immediate: true },
)

const status = computed(() => {
  switch (callStore.phase) {
    case 'outgoing':
      return callStore.call === null ? 'Подключаемся…' : 'Вызываем…'
    case 'connecting':
      return 'Устанавливаем соединение…'
    case 'active':
      if (callStore.reconnecting) {
        return 'Связь прервалась, восстанавливаем…'
      }
      return formatDuration(
        callStore.activeSince === null ? 0 : (now.value - callStore.activeSince) / 1000,
      )
    case 'ended':
      return callStore.endMessage
    default:
      return ''
  }
})

const showRemoteVideo = computed(() => {
  const media = callStore.remoteMedia
  return (
    callStore.phase === 'active' &&
    callStore.remoteStream !== null &&
    callStore.remoteVideoLive &&
    (media === null || media.camera || media.screen)
  )
})

const showLocalVideo = computed(
  () => callStore.hasVideo && callStore.cameraEnabled && callStore.phase !== 'ended',
)

const canSwap = computed(() => showRemoteVideo.value && showLocalVideo.value)

const remoteNotice = computed(() => {
  const media = callStore.remoteMedia
  if (callStore.phase !== 'active' || media === null) {
    return ''
  }
  if (media.screen) {
    return 'Собеседник показывает экран'
  }
  return media.mic ? '' : 'Собеседник выключил микрофон'
})

const quality = computed(() => {
  const stats = callStore.stats
  if (callStore.phase !== 'active' || stats === null) {
    return null
  }
  const labels = { good: 'Хорошая связь', fair: 'Средняя связь', poor: 'Плохая связь' }
  const details = [
    stats.roundTripMs === null ? null : `задержка ${stats.roundTripMs} мс`,
    `потери ${stats.packetLossPercent}%`,
    stats.relayed ? 'через TURN-сервер' : 'напрямую',
  ].filter(Boolean)
  return { level: stats.quality, label: labels[stats.quality], details: details.join(', ') }
})

function togglePanel(next: Exclude<Panel, null>): void {
  panel.value = panel.value === next ? null : next
  callStore.setChatOpen(panel.value === 'chat')
  if (panel.value === 'chat') {
    void nextTick(() => chat.value?.focus())
  }
}

function closePanel(): void {
  panel.value = null
  callStore.setChatOpen(false)
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined)
  } else {
    await root.value?.requestFullscreen().catch(() => undefined)
  }
}

async function togglePictureInPicture(): Promise<void> {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => undefined)
  } else {
    await remoteVideo.value?.requestPictureInPicture().catch(() => undefined)
  }
}

function onFullscreenChange(): void {
  fullscreen.value = document.fullscreenElement !== null
}

/** Буквы проверяем по физической клавише (event.code), чтобы работало и в русской раскладке */
function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const typing = target?.closest('input, textarea, select, [contenteditable="true"]') !== null
  if (!inCall.value || typing || event.ctrlKey || event.metaKey || event.altKey) {
    return
  }

  switch (event.code) {
    case 'KeyM':
      callStore.toggleMic()
      break
    case 'KeyV':
      void callStore.toggleCamera()
      break
    case 'KeyF':
      void toggleFullscreen()
      break
    case 'KeyC':
      togglePanel('chat')
      break
    default:
      return
  }
  event.preventDefault()
}

document.addEventListener('fullscreenchange', onFullscreenChange)
window.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  if (clock !== null) {
    clearInterval(clock)
  }
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="root"
      class="call"
      :class="{ 'call--swapped': swapped && canSwap }"
      role="dialog"
      aria-modal="true"
      aria-label="Видеозвонок"
    >
      <div class="call__stage">
        <video
          v-show="showRemoteVideo"
          ref="remoteVideo"
          class="call__remote"
          autoplay
          playsinline
          @click="swapped = false"
        />

        <div v-if="!showRemoteVideo" class="call__placeholder">
          <span class="call__avatar" aria-hidden="true">
            {{ callStore.counterpart?.name.charAt(0).toUpperCase() }}
          </span>
        </div>

        <header class="call__header">
          <h2 class="call__name">{{ callStore.counterpart?.name }}</h2>
          <p
            class="call__status"
            :class="{ 'call__status--warning': callStore.reconnecting }"
            aria-live="polite"
          >
            {{ status }}
          </p>
          <p v-if="remoteNotice" class="call__notice">{{ remoteNotice }}</p>
          <p
            v-if="quality"
            class="call__quality"
            :class="`call__quality--${quality.level}`"
            :title="quality.details"
          >
            <span class="call__quality-dot" aria-hidden="true" />
            {{ quality.label }}
            <span class="visually-hidden">: {{ quality.details }}</span>
          </p>
        </header>

        <p v-if="callStore.error && inCall" class="call__error" role="alert">
          {{ callStore.error }}
          <button type="button" class="call__error-close" @click="callStore.clearError()">
            Скрыть
          </button>
        </p>

        <video
          v-show="showLocalVideo"
          ref="localVideo"
          class="call__local"
          autoplay
          playsinline
          muted
          :title="canSwap ? 'Поменять местами' : undefined"
          @click="canSwap && (swapped = !swapped)"
        />

        <div v-if="panel !== null && inCall" class="call__panel">
          <CallChat v-if="panel === 'chat'" ref="chat" @close="closePanel" />
          <CallDevices v-else @close="closePanel" />
        </div>
      </div>

      <footer class="call__controls">
        <template v-if="callStore.phase === 'ended'">
          <BaseButton variant="ghost" class="call__control" @click="callStore.dismiss()">
            Закрыть
          </BaseButton>
        </template>
        <template v-else>
          <BaseButton
            variant="ghost"
            class="call__control"
            :aria-pressed="!callStore.micEnabled"
            aria-keyshortcuts="M"
            @click="callStore.toggleMic()"
          >
            {{ callStore.micEnabled ? 'Выключить микрофон' : 'Включить микрофон' }}
          </BaseButton>
          <BaseButton
            variant="ghost"
            class="call__control"
            :aria-pressed="!callStore.cameraEnabled"
            aria-keyshortcuts="V"
            @click="callStore.toggleCamera()"
          >
            {{ callStore.cameraEnabled ? 'Выключить камеру' : 'Включить камеру' }}
          </BaseButton>
          <BaseButton
            v-if="canShareScreen"
            variant="ghost"
            class="call__control"
            :disabled="callStore.phase !== 'active'"
            :aria-pressed="callStore.screenSharing"
            @click="callStore.toggleScreenShare()"
          >
            {{ callStore.screenSharing ? 'Остановить показ' : 'Показать экран' }}
          </BaseButton>
          <BaseButton
            variant="ghost"
            class="call__control"
            :disabled="callStore.phase !== 'active'"
            :aria-pressed="panel === 'chat'"
            aria-keyshortcuts="C"
            @click="togglePanel('chat')"
          >
            Чат
            <span v-if="callStore.unreadChat > 0" class="call__badge">
              {{ callStore.unreadChat }}
              <span class="visually-hidden">непрочитанных</span>
            </span>
          </BaseButton>
          <BaseButton
            variant="ghost"
            class="call__control"
            :aria-pressed="panel === 'devices'"
            @click="togglePanel('devices')"
          >
            Устройства
          </BaseButton>
          <BaseButton
            v-if="canPictureInPicture && showRemoteVideo"
            variant="ghost"
            class="call__control"
            @click="togglePictureInPicture()"
          >
            Картинка в картинке
          </BaseButton>
          <BaseButton
            variant="ghost"
            class="call__control"
            :aria-pressed="fullscreen"
            aria-keyshortcuts="F"
            @click="toggleFullscreen()"
          >
            {{ fullscreen ? 'Свернуть' : 'На весь экран' }}
          </BaseButton>
          <BaseButton variant="danger" @click="callStore.hangup()">Завершить</BaseButton>
        </template>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.call {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: var(--color-video-bg);
  color: var(--color-video-text);
}

.call__stage {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.call__remote {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.call__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.call__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 7rem;
  height: 7rem;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-on-accent);
  font-size: 3rem;
  font-weight: 600;
}

.call__header {
  position: absolute;
  top: 1.5rem;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
  pointer-events: none;
}

.call__name {
  margin: 0;
  font-size: 1.5rem;
}

.call__status {
  margin: 0;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.call__status--warning {
  color: var(--color-warning);
  opacity: 1;
}

.call__notice,
.call__quality {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  background: var(--color-video-panel);
  font-size: 0.8125rem;
  pointer-events: auto;
}

.call__quality-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-success);
}

.call__quality--fair .call__quality-dot {
  background: var(--color-warning);
}

.call__quality--poor .call__quality-dot {
  background: var(--color-danger);
}

.call__error {
  position: absolute;
  top: 1.5rem;
  left: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(32rem, calc(100% - 2rem));
  margin: 0;
  padding: 0.5rem 0.875rem;
  border-radius: var(--radius);
  background: var(--color-danger);
  color: var(--color-on-accent);
  transform: translateX(-50%);
}

.call__error-close {
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.call__local {
  position: absolute;
  right: 1.5rem;
  bottom: 1.5rem;
  width: min(30vw, 14rem);
  aspect-ratio: 4 / 3;
  border: 2px solid var(--color-video-text);
  border-radius: var(--radius);
  background: var(--color-video-bg);
  object-fit: cover;
  transform: scaleX(-1);
  cursor: pointer;
}

.call--swapped .call__local {
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border: none;
  border-radius: 0;
  object-fit: contain;
  cursor: default;
}

.call--swapped .call__remote {
  position: absolute;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 1;
  width: min(30vw, 14rem);
  height: auto;
  aspect-ratio: 4 / 3;
  border: 2px solid var(--color-video-text);
  border-radius: var(--radius);
  background: var(--color-video-bg);
  object-fit: cover;
  cursor: pointer;
}

.call__panel {
  position: absolute;
  top: 1rem;
  bottom: 1rem;
  left: 1rem;
  z-index: 3;
  display: flex;
  align-items: flex-start;
  max-width: calc(100% - 2rem);
}

.call__controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.25rem;
}

.call__control {
  color: var(--color-video-text);
}

.call__control:hover:not(:disabled) {
  color: var(--color-text);
}

.call__badge {
  min-width: 1.25rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: var(--color-danger);
  color: var(--color-on-accent);
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
