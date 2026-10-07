<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import BaseIcon from '@/components/ui/BaseIcon.vue'
import { t } from '@/i18n'
import { formatDuration } from '@/utils/format'

const BARS = 40

const props = defineProps<{
  src: string | null
  durationMs: number | null
  /** Громкость по отрезкам, 0–100; нет — ровная полоска */
  waveform: number[] | null
}>()

const audio = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const position = ref(0)

const duration = computed(() => (props.durationMs ?? 0) / 1000)

/** Полоска громкости, ужатая до BARS столбиков */
const bars = computed(() => {
  const source = props.waveform ?? []
  if (source.length === 0) {
    return Array.from({ length: BARS }, () => 30)
  }
  return Array.from({ length: BARS }, (_, index) => {
    const from = Math.floor((index * source.length) / BARS)
    const to = Math.max(from + 1, Math.floor(((index + 1) * source.length) / BARS))
    return Math.max(8, ...source.slice(from, to))
  })
})

const progress = computed(() => (duration.value > 0 ? position.value / duration.value : 0))

function toggle(): void {
  const element = audio.value
  if (element === null || props.src === null) {
    return
  }
  if (element.paused) {
    void element.play()
  } else {
    element.pause()
  }
}

function seek(event: MouseEvent): void {
  const element = audio.value
  const target = event.currentTarget as HTMLElement
  if (element === null || duration.value === 0) {
    return
  }
  const rect = target.getBoundingClientRect()
  element.currentTime = ((event.clientX - rect.left) / rect.width) * duration.value
}

onBeforeUnmount(() => audio.value?.pause())
</script>

<template>
  <div class="voice">
    <button
      type="button"
      class="voice__toggle"
      :disabled="src === null"
      :aria-label="t(playing ? 'chats.attachments.pause' : 'chats.attachments.play')"
      @click="toggle"
    >
      <BaseIcon :name="playing ? 'pause' : 'play'" />
    </button>
    <div class="voice__body">
      <div class="voice__wave" aria-hidden="true" @click="seek">
        <span
          v-for="(height, index) in bars"
          :key="index"
          class="voice__bar"
          :class="{ 'voice__bar--played': index / BARS < progress }"
          :style="{ height: `${height}%` }"
        />
      </div>
      <span class="voice__time">
        {{ formatDuration(playing || position > 0 ? position : duration) }}
      </span>
    </div>
    <audio
      v-if="src"
      ref="audio"
      :src="src"
      preload="none"
      @play="playing = true"
      @pause="playing = false"
      @ended="((playing = false), (position = 0))"
      @timeupdate="position = ($event.target as HTMLAudioElement).currentTime"
    />
  </div>
</template>

<style scoped>
.voice {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 13rem;
  padding: 0.125rem 0;
}

.voice__toggle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-on-accent);
  cursor: pointer;
}

.voice__toggle:disabled {
  opacity: 0.6;
  cursor: default;
}

:global(.bubble--mine) .voice__toggle {
  background: var(--color-on-accent);
  color: var(--color-primary);
}

.voice__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
}

.voice__wave {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 1.75rem;
  cursor: pointer;
}

.voice__bar {
  flex: 1;
  min-height: 3px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.35;
}

.voice__bar--played {
  opacity: 1;
}

.voice__time {
  font-size: 0.75rem;
  opacity: 0.8;
}
</style>
