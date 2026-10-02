<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch, watchEffect } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useCallStore } from '@/stores/call'
import { formatDuration } from '@/utils/format'

const callStore = useCallStore()

const localVideo = useTemplateRef<HTMLVideoElement>('localVideo')
const remoteVideo = useTemplateRef<HTMLVideoElement>('remoteVideo')

const visible = computed(() => callStore.phase !== 'idle' && callStore.phase !== 'incoming')

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

onBeforeUnmount(() => {
  if (clock !== null) {
    clearInterval(clock)
  }
})

const status = computed(() => {
  switch (callStore.phase) {
    case 'outgoing':
      return callStore.call === null ? 'Подключаемся…' : 'Вызываем…'
    case 'connecting':
      return 'Устанавливаем соединение…'
    case 'active':
      return formatDuration(
        callStore.activeSince === null ? 0 : (now.value - callStore.activeSince) / 1000,
      )
    case 'ended':
      return callStore.endMessage
    default:
      return ''
  }
})

const showRemoteVideo = computed(
  () => callStore.phase === 'active' && callStore.remoteStream !== null,
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="call" role="dialog" aria-modal="true" aria-label="Видеозвонок">
      <div class="call__stage">
        <video
          v-show="showRemoteVideo"
          ref="remoteVideo"
          class="call__remote"
          autoplay
          playsinline
        />

        <div v-if="!showRemoteVideo" class="call__placeholder">
          <span class="call__avatar" aria-hidden="true">
            {{ callStore.counterpart?.name.charAt(0).toUpperCase() }}
          </span>
        </div>

        <header class="call__header">
          <h2 class="call__name">{{ callStore.counterpart?.name }}</h2>
          <p class="call__status" aria-live="polite">{{ status }}</p>
        </header>

        <video
          v-show="callStore.hasVideo && callStore.cameraEnabled && callStore.phase !== 'ended'"
          ref="localVideo"
          class="call__local"
          autoplay
          playsinline
          muted
        />
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
            @click="callStore.toggleMic()"
          >
            {{ callStore.micEnabled ? 'Выключить микрофон' : 'Включить микрофон' }}
          </BaseButton>
          <BaseButton
            variant="ghost"
            class="call__control"
            :disabled="!callStore.hasVideo"
            :aria-pressed="!callStore.cameraEnabled"
            @click="callStore.toggleCamera()"
          >
            {{ callStore.cameraEnabled ? 'Выключить камеру' : 'Включить камеру' }}
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
  text-align: center;
}

.call__name {
  margin: 0;
  font-size: 1.5rem;
}

.call__status {
  margin: 0.25rem 0 0;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
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
</style>
