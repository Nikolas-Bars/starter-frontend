<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useCallStore } from '@/stores/call'
import { useCallSettingsStore } from '@/stores/callSettings'

const emit = defineEmits<{ close: [] }>()

const callStore = useCallStore()
const settings = useCallSettingsStore()

const devices = ref<MediaDeviceInfo[]>([])

/** Выбор динамика есть не во всех браузерах (Safari и Firefox на телефонах его не умеют) */
const canChooseOutput =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

async function loadDevices(): Promise<void> {
  devices.value = (await navigator.mediaDevices?.enumerateDevices().catch(() => [])) ?? []
}

function byKind(kind: MediaDeviceKind): MediaDeviceInfo[] {
  return devices.value.filter((device) => device.kind === kind && device.deviceId !== '')
}

/** Текущее устройство: из настроек, иначе то, что сейчас реально используется */
function selected(kind: MediaDeviceKind): string {
  const saved =
    kind === 'audioinput'
      ? settings.audioInputId
      : kind === 'videoinput'
        ? settings.videoInputId
        : settings.audioOutputId
  if (saved !== null) {
    return saved
  }

  const track =
    kind === 'audioinput'
      ? callStore.localStream?.getAudioTracks()[0]
      : kind === 'videoinput'
        ? callStore.localStream?.getVideoTracks()[0]
        : undefined
  return track?.getSettings().deviceId ?? 'default'
}

const groups = computed(() =>
  [
    { kind: 'audioinput' as const, label: 'Микрофон' },
    { kind: 'videoinput' as const, label: 'Камера' },
    ...(canChooseOutput ? [{ kind: 'audiooutput' as const, label: 'Динамик' }] : []),
  ].map((group) => ({ ...group, options: byKind(group.kind) })),
)

function onChange(kind: MediaDeviceKind, event: Event): void {
  void callStore.selectDevice(kind, (event.target as HTMLSelectElement).value)
}

onMounted(() => {
  void loadDevices()
  navigator.mediaDevices?.addEventListener('devicechange', loadDevices)
})

onBeforeUnmount(() => {
  navigator.mediaDevices?.removeEventListener('devicechange', loadDevices)
})
</script>

<template>
  <aside class="devices" aria-label="Устройства">
    <header class="devices__header">
      <h3 class="devices__title">Устройства</h3>
      <button type="button" class="devices__close" aria-label="Закрыть" @click="emit('close')">
        ×
      </button>
    </header>

    <label v-for="group in groups" :key="group.kind" class="devices__field">
      <span>{{ group.label }}</span>
      <select
        class="devices__select"
        :value="selected(group.kind)"
        :disabled="group.options.length === 0"
        @change="onChange(group.kind, $event)"
      >
        <option v-if="group.options.length === 0" value="default">Не найдено</option>
        <option
          v-for="(device, index) in group.options"
          :key="device.deviceId"
          :value="device.deviceId"
        >
          {{ device.label || `${group.label} ${index + 1}` }}
        </option>
      </select>
    </label>
  </aside>
</template>

<style scoped>
.devices {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: min(22rem, 100%);
  padding: 0.75rem 1rem 1rem;
  border-radius: var(--radius);
  background: var(--color-video-panel);
  color: var(--color-video-text);
}

.devices__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.devices__title {
  margin: 0;
  font-size: 1rem;
}

.devices__close {
  border: none;
  background: none;
  color: inherit;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.devices__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.devices__select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
}
</style>
