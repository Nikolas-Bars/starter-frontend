<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { ApiError } from '@/api/http'
import { t } from '@/i18n'
import { useChatStore } from '@/stores/chat'

/** Что пересылаем; null — диалог закрыт */
const props = defineProps<{ messageId: number | null }>()
const emit = defineEmits<{ close: [] }>()

const chatStore = useChatStore()
const router = useRouter()

const dialog = ref<HTMLDialogElement | null>(null)
const query = ref('')
const sending = ref<number | null>(null)
const error = ref('')

const targets = computed(() => {
  const search = query.value.trim().toLowerCase()
  return chatStore.sortedChats.filter(
    (chat) =>
      chat.peer !== null &&
      (search === '' ||
        chat.peer.name.toLowerCase().includes(search) ||
        (chat.peer.username ?? '').includes(search.replace(/^@/, ''))),
  )
})

watch(
  () => props.messageId,
  (messageId) => {
    if (messageId !== null) {
      query.value = ''
      error.value = ''
      dialog.value?.showModal()
    } else {
      dialog.value?.close()
    }
  },
)

async function forwardTo(chatId: number): Promise<void> {
  if (props.messageId === null || sending.value !== null) {
    return
  }
  sending.value = chatId
  error.value = ''
  try {
    await chatStore.forward(chatId, props.messageId)
    emit('close')
    void router.push({ name: 'chat', params: { id: chatId } })
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : t('chats.forward.failed')
  } finally {
    sending.value = null
  }
}
</script>

<template>
  <dialog ref="dialog" class="forward" aria-labelledby="forward-title" @close="emit('close')">
    <header class="forward__header">
      <h2 id="forward-title" class="forward__title">{{ t('chats.forward.title') }}</h2>
      <button
        type="button"
        class="forward__close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <BaseIcon name="close" />
      </button>
    </header>

    <input
      v-model="query"
      class="forward__search"
      type="search"
      :placeholder="t('chats.forward.placeholder')"
      :aria-label="t('chats.forward.search')"
    />
    <FormAlert :message="error" />

    <ul class="forward__list">
      <li v-for="chat in targets" :key="chat.id">
        <button
          type="button"
          class="forward__item"
          :disabled="sending !== null"
          @click="forwardTo(chat.id)"
        >
          <BaseAvatar :name="chat.peer!.name" :src="chat.peer!.avatar_url" />
          <span class="forward__name">{{ chat.peer!.name }}</span>
          <span v-if="sending === chat.id" class="forward__sending">{{
            t('chats.forward.sending')
          }}</span>
        </button>
      </li>
      <li v-if="targets.length === 0" class="forward__empty">{{ t('chats.forward.empty') }}</li>
    </ul>
  </dialog>
</template>

<style scoped>
.forward {
  width: min(26rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 1.25rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow);
}

.forward::backdrop {
  background: var(--color-overlay);
}

.forward__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.forward__title {
  margin: 0;
  font-size: 1.25rem;
}

.forward__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
}

.forward__close:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.forward__search {
  width: 100%;
  margin-bottom: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.forward__search:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.forward__list {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  max-height: 60dvh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.forward__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.forward__item:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.forward__item:disabled {
  cursor: progress;
}

.forward__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward__sending,
.forward__empty {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.forward__empty {
  padding: 0.5rem;
}
</style>
