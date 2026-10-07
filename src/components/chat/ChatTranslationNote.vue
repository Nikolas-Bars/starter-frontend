<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { ApiError } from '@/api/http'
import { useChatStore } from '@/stores/chat'

/** Совпадает с ChatTranslationNoteRequest::MAX_LENGTH на бэкенде */
const MAX_NOTE_LENGTH = 500

const props = defineProps<{ chatId: number }>()

const chatStore = useChatStore()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const draft = ref('')
const saving = ref(false)
const error = ref('')

const note = computed(() => chatStore.chats[props.chatId]?.translation_note ?? null)

function onDocumentPointer(event: PointerEvent): void {
  if (root.value !== null && !root.value.contains(event.target as Node)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    open.value = false
  }
}

watch(open, (value) => {
  if (value) {
    draft.value = note.value ?? ''
    error.value = ''
    document.addEventListener('pointerdown', onDocumentPointer)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointer)
    document.removeEventListener('keydown', onKeydown)
  }
})

watch(
  () => props.chatId,
  () => (open.value = false),
)

onBeforeUnmount(() => (open.value = false))

async function save(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    await chatStore.setTranslationNote(props.chatId, draft.value)
    open.value = false
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : 'Не удалось сохранить заметку.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div ref="root" class="note">
    <button
      type="button"
      class="note__trigger"
      :class="{ 'note__trigger--active': note !== null }"
      aria-label="Заметка для перевода"
      title="Заметка для перевода"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open = !open"
    >
      <BaseIcon name="globe" />
    </button>
    <form
      v-if="open"
      class="note__popup"
      role="dialog"
      aria-label="Заметка для перевода"
      @submit.prevent="save"
    >
      <label class="note__label" for="translation-note">Кто вы друг другу?</label>
      <textarea
        id="translation-note"
        v-model="draft"
        class="note__input"
        rows="3"
        :maxlength="MAX_NOTE_LENGTH"
        placeholder="Например: бабушка и внук"
      />
      <p class="note__hint">
        Переводчик выберет по ней обращения. Заметку видят все участники чата.
      </p>
      <FormAlert v-if="error" :message="error" />
      <BaseButton type="submit" :loading="saving">Сохранить</BaseButton>
    </form>
  </div>
</template>

<style scoped>
.note {
  position: relative;
}

.note__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--color-text);
  cursor: pointer;
}

.note__trigger:hover {
  background: var(--color-surface-muted);
}

.note__trigger--active {
  color: var(--color-accent-text);
}

.note__popup {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(20rem, 80vw);
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.note__label {
  font-weight: 600;
}

.note__input {
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius) / 2);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  resize: vertical;
}

.note__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
</style>
