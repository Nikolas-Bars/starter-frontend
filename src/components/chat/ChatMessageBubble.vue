<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'
import { REACTIONS, type ThreadMessage } from '@/stores/chat'
import { callTitle, isMissedCall } from '@/utils/chatCall'
import { formatDuration, formatTime } from '@/utils/format'

const props = defineProps<{
  message: ThreadMessage
  mine: boolean
  /** Собеседник прочитал это сообщение */
  read: boolean
  myId: number | null
}>()

const emit = defineEmits<{ retry: []; react: [emoji: string]; callBack: [] }>()

const pickerOpen = ref(false)
const root = ref<HTMLElement | null>(null)

const callNote = computed<{
  title: string
  duration: string | null
  missed: boolean
  icon: IconName
} | null>(() => {
  const call = props.message.call
  if (call === null) {
    return null
  }
  return {
    title: callTitle(call, props.mine),
    duration: call.duration_seconds === null ? null : formatDuration(call.duration_seconds),
    missed: isMissedCall(call, props.mine),
    icon: call.status === 'ended' ? 'phone' : 'phone-off',
  }
})

const status = computed<{ icon: IconName; label: string } | null>(() => {
  if (!props.mine || callNote.value !== null) {
    return null
  }
  switch (props.message.pending) {
    case 'sending':
      return { icon: 'clock', label: 'Отправляется' }
    case 'failed':
      return { icon: 'alert', label: 'Не отправлено' }
    default:
      return props.read
        ? { icon: 'check-double', label: 'Прочитано' }
        : { icon: 'check', label: 'Отправлено' }
  }
})

const canReact = computed(() => props.message.id > 0)

const myReaction = computed(
  () =>
    props.message.reactions.find(
      (group) => props.myId !== null && group.user_ids.includes(props.myId),
    )?.emoji ?? null,
)

function react(emoji: string): void {
  pickerOpen.value = false
  emit('react', emoji)
}

function onDocumentPointer(event: PointerEvent): void {
  if (root.value !== null && !root.value.contains(event.target as Node)) {
    pickerOpen.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    pickerOpen.value = false
  }
}

watch(pickerOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocumentPointer)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointer)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => (pickerOpen.value = false))
</script>

<template>
  <div ref="root" class="message" :class="{ 'message--mine': mine }">
    <div class="message__row">
      <div
        class="bubble"
        :class="{ 'bubble--mine': mine, 'bubble--failed': message.pending === 'failed' }"
      >
        <button
          v-if="callNote"
          type="button"
          class="call-note"
          :class="{ 'call-note--missed': callNote.missed }"
          :aria-label="`${callNote.title}. Перезвонить`"
          title="Перезвонить"
          @click="emit('callBack')"
        >
          <span class="call-note__icon"><BaseIcon :name="callNote.icon" /></span>
          <span class="call-note__text">
            <span class="call-note__title">{{ callNote.title }}</span>
            <span v-if="callNote.duration" class="call-note__duration">{{
              callNote.duration
            }}</span>
          </span>
        </button>
        <p v-else class="bubble__body">{{ message.body }}</p>
        <div v-if="message.reactions.length > 0" class="bubble__reactions">
          <button
            v-for="group in message.reactions"
            :key="group.emoji"
            type="button"
            class="reaction"
            :class="{ 'reaction--mine': myId !== null && group.user_ids.includes(myId) }"
            :aria-pressed="myId !== null && group.user_ids.includes(myId)"
            :aria-label="`${group.emoji}: ${group.user_ids.length}`"
            @click="react(group.emoji)"
          >
            <span class="reaction__emoji">{{ group.emoji }}</span>
            <span v-if="group.user_ids.length > 1" class="reaction__count">
              {{ group.user_ids.length }}
            </span>
          </button>
        </div>
        <span class="bubble__meta">
          <time v-if="message.created_at" :datetime="message.created_at">
            {{ formatTime(message.created_at) }}
          </time>
          <span v-if="status" class="bubble__status" :title="status.label">
            <BaseIcon :name="status.icon" class="bubble__icon" />
            <span class="visually-hidden">{{ status.label }}</span>
          </span>
        </span>
      </div>

      <div v-if="canReact" class="message__react">
        <button
          type="button"
          class="message__react-trigger"
          :class="{ 'message__react-trigger--open': pickerOpen }"
          aria-label="Поставить реакцию"
          title="Реакция"
          :aria-expanded="pickerOpen"
          @click="pickerOpen = !pickerOpen"
        >
          <BaseIcon name="smile" />
        </button>
        <div v-if="pickerOpen" class="picker" role="menu" aria-label="Реакции">
          <button
            v-for="emoji in REACTIONS"
            :key="emoji"
            type="button"
            role="menuitemradio"
            class="picker__emoji"
            :class="{ 'picker__emoji--mine': emoji === myReaction }"
            :aria-checked="emoji === myReaction"
            :aria-label="emoji"
            @click="react(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>
    </div>
    <button
      v-if="message.pending === 'failed'"
      type="button"
      class="message__retry"
      @click="emit('retry')"
    >
      Не отправлено — повторить
    </button>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.message--mine {
  align-items: flex-end;
}

.message__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: min(34rem, 85%);
}

.message--mine .message__row {
  flex-direction: row-reverse;
}

.bubble {
  position: relative;
  min-width: 0;
  padding: 0.5rem 0.75rem 0.375rem;
  border-radius: 1rem 1rem 1rem 0.25rem;
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.bubble--mine {
  border-radius: 1rem 1rem 0.25rem 1rem;
  background: var(--color-primary);
  color: var(--color-on-accent);
}

.bubble--failed {
  opacity: 0.7;
}

.bubble__body {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.call-note {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.125rem 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.call-note__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.bubble--mine .call-note__icon {
  background: color-mix(in srgb, var(--color-on-accent) 22%, transparent);
  color: var(--color-on-accent);
}

.call-note--missed .call-note__icon {
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
}

.call-note__text {
  display: flex;
  flex-direction: column;
}

.call-note__title {
  font-weight: 600;
}

.call-note--missed .call-note__title {
  color: var(--color-danger-text);
}

.call-note__duration {
  font-size: 0.8125rem;
  opacity: 0.8;
}

.call-note:hover .call-note__title {
  text-decoration: underline;
}

.bubble__reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.375rem;
}

.reaction {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.625rem;
  padding: 0 0.5rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.bubble--mine .reaction {
  background: color-mix(in srgb, var(--color-on-accent) 22%, transparent);
  color: var(--color-on-accent);
}

.reaction--mine {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.bubble--mine .reaction--mine {
  border-color: var(--color-on-accent);
}

.reaction__emoji {
  font-size: 0.9375rem;
  line-height: 1;
}

.reaction__count {
  font-weight: 600;
}

.bubble__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  margin-top: 0.125rem;
  font-size: 0.6875rem;
  opacity: 0.75;
}

.bubble__status {
  display: inline-flex;
}

.bubble__icon {
  width: 0.875rem;
  height: 0.875rem;
}

.message__react {
  flex-shrink: 0;
}

.message__react-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s;
}

.message:hover .message__react-trigger,
.message__react-trigger:focus-visible,
.message__react-trigger--open {
  opacity: 1;
}

.message__react-trigger:hover,
.message__react-trigger--open {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

/* На сенсорных экранах наведения нет: кнопка видна всегда, но неярко */
@media (hover: none) {
  .message__react-trigger {
    opacity: 0.5;
  }
}

.picker {
  position: absolute;
  bottom: calc(100% + 0.25rem);
  left: 0;
  z-index: 5;
  display: flex;
  gap: 0.125rem;
  padding: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.message--mine .picker {
  right: 0;
  left: auto;
}

.picker__emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 50%;
  background: none;
  font-size: 1.25rem;
  cursor: pointer;
  transition: transform 0.1s;
}

.picker__emoji:hover {
  background: var(--color-surface-muted);
  transform: scale(1.15);
}

.picker__emoji--mine {
  background: var(--color-primary-soft);
}

.message__retry {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-danger-text);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.message__retry:hover {
  text-decoration: underline;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 40rem) {
  .picker__emoji {
    width: 2rem;
    height: 2rem;
    font-size: 1.125rem;
  }
}
</style>
