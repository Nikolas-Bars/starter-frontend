<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import BaseIcon from '@/components/ui/BaseIcon.vue'
import { MAX_MESSAGE_LENGTH } from '@/stores/chat'

const MAX_HEIGHT_PX = 160

const props = defineProps<{ chatId: number }>()

const emit = defineEmits<{ send: [text: string]; typing: [] }>()

/** Черновики живут, пока открыта вкладка: переключение между чатами их не теряет */
const drafts = new Map<number, string>()

const text = ref('')
const field = ref<HTMLTextAreaElement | null>(null)

watch(
  () => props.chatId,
  (chatId, previous) => {
    if (previous !== undefined) {
      drafts.set(previous, text.value)
    }
    text.value = drafts.get(chatId) ?? ''
    void nextTick(() => {
      resize()
      field.value?.focus({ preventScroll: true })
    })
  },
  { immediate: true },
)

function resize(): void {
  const element = field.value
  if (element === null) {
    return
  }
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`
}

function submit(): void {
  if (text.value.trim() === '') {
    return
  }
  emit('send', text.value)
  text.value = ''
  drafts.delete(props.chatId)
  void nextTick(resize)
}

function onInput(): void {
  resize()
  if (text.value.trim() !== '') {
    emit('typing')
  }
}

function onKeydown(event: KeyboardEvent): void {
  // Enter отправляет, Shift+Enter — новая строка; во время набора иероглифов Enter подтверждает ввод
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      ref="field"
      v-model="text"
      class="composer__input"
      rows="1"
      :maxlength="MAX_MESSAGE_LENGTH"
      placeholder="Сообщение"
      aria-label="Текст сообщения"
      @input="onInput"
      @keydown="onKeydown"
    />
    <button
      type="submit"
      class="composer__send"
      :disabled="text.trim() === ''"
      aria-label="Отправить"
      title="Отправить (Enter)"
    >
      <BaseIcon name="send" />
    </button>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-border);
}

.composer__input {
  flex: 1;
  min-height: 2.75rem;
  padding: 0.625rem 1rem;
  border: 1px solid transparent;
  border-radius: 1.375rem;
  background: var(--color-surface-muted);
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  resize: none;
}

.composer__input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.composer__send {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-on-accent);
  cursor: pointer;
}

.composer__send:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.composer__send:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 40rem) {
  .composer {
    padding: 0.5rem 0.75rem;
  }
}
</style>
