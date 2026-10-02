<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'

import { MAX_CHAT_MESSAGE_LENGTH, useCallStore } from '@/stores/call'
import { formatTime } from '@/utils/format'

const emit = defineEmits<{ close: [] }>()

const callStore = useCallStore()

const draft = ref('')
const list = useTemplateRef<HTMLOListElement>('list')
const input = useTemplateRef<HTMLInputElement>('input')

function send(): void {
  if (callStore.sendChat(draft.value)) {
    draft.value = ''
  }
}

watch(
  () => callStore.chatMessages.length,
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
)

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <aside class="chat" aria-label="Чат звонка">
    <header class="chat__header">
      <h3 class="chat__title">Чат</h3>
      <button type="button" class="chat__close" aria-label="Закрыть чат" @click="emit('close')">
        ×
      </button>
    </header>

    <ol ref="list" class="chat__messages" aria-live="polite">
      <li
        v-for="message in callStore.chatMessages"
        :key="message.id"
        class="chat__message"
        :class="{ 'chat__message--mine': message.mine }"
      >
        <span class="chat__text">{{ message.text }}</span>
        <time class="chat__time" :datetime="message.sentAt">{{ formatTime(message.sentAt) }}</time>
      </li>
      <li v-if="callStore.chatMessages.length === 0" class="chat__empty">
        Сообщения видны только участникам и не сохраняются после звонка.
      </li>
    </ol>

    <form class="chat__form" @submit.prevent="send">
      <input
        ref="input"
        v-model="draft"
        class="chat__input"
        type="text"
        :maxlength="MAX_CHAT_MESSAGE_LENGTH"
        placeholder="Сообщение"
        aria-label="Сообщение"
        :disabled="callStore.phase !== 'active'"
      />
      <button type="submit" class="chat__send" :disabled="draft.trim() === ''">Отправить</button>
    </form>
  </aside>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  width: min(22rem, 100%);
  height: 100%;
  border-radius: var(--radius);
  background: var(--color-video-panel);
  color: var(--color-video-text);
}

.chat__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.chat__title {
  margin: 0;
  font-size: 1rem;
}

.chat__close {
  border: none;
  background: none;
  color: inherit;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.chat__messages {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 8rem;
  margin: 0;
  padding: 0 1rem;
  overflow-y: auto;
  list-style: none;
}

.chat__message {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
  max-width: 85%;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--color-surface-muted);
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.chat__message--mine {
  align-self: flex-end;
  background: var(--color-primary);
  color: var(--color-on-accent);
}

.chat__time {
  align-self: flex-end;
  font-size: 0.75rem;
  opacity: 0.7;
}

.chat__empty {
  font-size: 0.875rem;
  opacity: 0.7;
}

.chat__form {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem 1rem;
}

.chat__input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.chat__send {
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-primary);
  color: var(--color-on-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.chat__send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
