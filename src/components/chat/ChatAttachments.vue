<script setup lang="ts">
import { computed } from 'vue'

import ChatVoicePlayer from '@/components/chat/ChatVoicePlayer.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { apiUrl } from '@/api/http'
import { useChatStore, type LocalUpload } from '@/stores/chat'
import type { ChatAttachment } from '@/types/api'
import { formatFileSize } from '@/utils/chatAttachment'

const props = defineProps<{
  attachments: ChatAttachment[]
  /** Своё неотправленное сообщение: прогресс загрузки по тем же индексам */
  uploads?: LocalUpload[]
}>()

const chatStore = useChatStore()

interface Item {
  attachment: ChatAttachment
  /** Доля загрузки своего файла; null — уже на сервере */
  progress: number | null
}

const items = computed<Item[]>(() =>
  props.attachments.map((attachment, index) => {
    const upload = props.uploads?.[index]
    return {
      attachment,
      progress: upload === undefined || upload.attachmentId !== null ? null : upload.progress,
    }
  }),
)

const media = computed(() =>
  items.value.filter(
    ({ attachment }) => attachment.kind === 'image' || attachment.kind === 'video',
  ),
)
const voices = computed(() => items.value.filter(({ attachment }) => attachment.kind === 'voice'))
const files = computed(() => items.value.filter(({ attachment }) => attachment.kind === 'file'))

/** Ссылки локальных заглушек — blob:, серверные — относительные /api/files/… */
function link(url: string | null): string | null {
  if (url === null) {
    return null
  }
  return url.startsWith('/') ? apiUrl(url) : url
}

function full(attachment: ChatAttachment): string | null {
  return link(attachment.url) ?? chatStore.previewOf(attachment.id)
}

function thumb(attachment: ChatAttachment): string | null {
  return link(attachment.thumb_url) ?? link(attachment.url) ?? chatStore.previewOf(attachment.id)
}

/** Пропорции одиночного фото или видео, в разумных пределах */
function ratio(attachment: ChatAttachment): string {
  if (attachment.width === null || attachment.height === null || media.value.length > 1) {
    return media.value.length > 1 ? '1' : '4 / 3'
  }
  const value = Math.min(Math.max(attachment.width / attachment.height, 0.5), 2)
  return String(value)
}

function overlay(item: Item): string | null {
  if (item.progress !== null) {
    return `${Math.round(item.progress * 100)}%`
  }
  switch (item.attachment.status) {
    case 'processing':
      return 'Сжимаем…'
    case 'failed':
      return 'Не удалось обработать'
    default:
      return null
  }
}
</script>

<template>
  <div class="attachments">
    <div v-if="media.length" class="media" :class="{ 'media--grid': media.length > 1 }">
      <div
        v-for="item in media"
        :key="item.attachment.id"
        class="media__tile"
        :style="{ aspectRatio: ratio(item.attachment) }"
      >
        <template v-if="item.attachment.kind === 'image'">
          <a
            v-if="full(item.attachment) && item.attachment.status === 'ready'"
            :href="full(item.attachment)!"
            target="_blank"
            rel="noopener"
            class="media__link"
            :aria-label="`Открыть фото ${item.attachment.name}`"
          >
            <img class="media__content" :src="thumb(item.attachment)!" alt="" loading="lazy" />
          </a>
          <img
            v-else-if="thumb(item.attachment)"
            class="media__content"
            :src="thumb(item.attachment)!"
            alt=""
          />
        </template>
        <video
          v-else-if="item.attachment.status === 'ready' && full(item.attachment)"
          class="media__content"
          :src="full(item.attachment)!"
          :poster="link(item.attachment.thumb_url) ?? undefined"
          controls
          playsinline
          preload="none"
        />
        <video
          v-else-if="full(item.attachment)"
          class="media__content"
          :src="full(item.attachment)!"
          muted
          playsinline
          preload="metadata"
        />
        <span v-if="!full(item.attachment) && !thumb(item.attachment)" class="media__placeholder">
          <BaseIcon :name="item.attachment.kind === 'video' ? 'video' : 'image'" />
        </span>
        <span
          v-if="overlay(item)"
          class="media__overlay"
          :class="{ 'media__overlay--failed': item.attachment.status === 'failed' }"
        >
          {{ overlay(item) }}
        </span>
      </div>
    </div>

    <div v-for="item in voices" :key="item.attachment.id" class="attachments__voice">
      <ChatVoicePlayer
        :src="item.attachment.status === 'ready' ? link(item.attachment.url) : null"
        :duration-ms="item.attachment.duration_ms"
        :waveform="item.attachment.waveform"
      />
      <span v-if="overlay(item)" class="attachments__note">{{ overlay(item) }}</span>
    </div>

    <component
      :is="item.attachment.url ? 'a' : 'div'"
      v-for="item in files"
      :key="item.attachment.id"
      class="file"
      :href="link(item.attachment.url) ?? undefined"
      :download="item.attachment.url ? item.attachment.name : undefined"
    >
      <span class="file__icon"><BaseIcon :name="item.attachment.url ? 'download' : 'file'" /></span>
      <span class="file__text">
        <span class="file__name">{{ item.attachment.name }}</span>
        <span class="file__size">
          {{ overlay(item) ?? formatFileSize(item.attachment.size) }}
        </span>
      </span>
    </component>
  </div>
</template>

<style scoped>
.attachments {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.25rem;
}

.media {
  display: grid;
  gap: 2px;
  width: 20rem;
  max-width: 100%;
  overflow: hidden;
  border-radius: 0.75rem;
}

.media--grid {
  grid-template-columns: repeat(2, 1fr);
}

.media__tile {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.media__link {
  display: block;
  width: 100%;
  height: 100%;
}

.media__content {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.media__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.5rem;
  opacity: 0.5;
}

.media__overlay {
  position: absolute;
  right: 0.375rem;
  bottom: 0.375rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 0.75rem;
  pointer-events: none;
}

.media__overlay--failed {
  background: var(--color-danger-text);
}

.attachments__voice {
  display: flex;
  flex-direction: column;
}

.attachments__note {
  font-size: 0.75rem;
  opacity: 0.8;
}

.file {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 12rem;
  color: inherit;
  text-decoration: none;
}

.file__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 15%, transparent);
}

.file__text {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.file__name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.file:hover .file__name {
  text-decoration: underline;
}

.file__size {
  font-size: 0.75rem;
  opacity: 0.8;
}
</style>
