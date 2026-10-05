<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import ChatFoldersDialog from '@/components/chat/ChatFoldersDialog.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import ChatThread from '@/components/chat/ChatThread.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useCallStore } from '@/stores/call'
import { useChatStore } from '@/stores/chat'
import { useChatFoldersStore } from '@/stores/chatFolders'

const route = useRoute()
const chatStore = useChatStore()
const folderStore = useChatFoldersStore()
const callStore = useCallStore()

const chatId = computed(() => (route.name === 'chat' ? Number(route.params.id) : null))

onMounted(() => {
  if (!chatStore.listLoaded) {
    void chatStore.loadChats()
  }
  if (!folderStore.loaded) {
    void folderStore.load()
  }
})
</script>

<template>
  <section class="messenger" :class="{ 'messenger--thread': chatId !== null }">
    <ChatSidebar class="messenger__sidebar" />
    <ChatFoldersDialog />

    <div class="messenger__main">
      <div v-if="callStore.error" class="messenger__error">
        <FormAlert :message="callStore.error" />
        <button type="button" class="messenger__error-close" @click="callStore.clearError()">
          Скрыть
        </button>
      </div>
      <ChatThread
        v-if="chatId !== null"
        :key="chatId"
        class="messenger__thread"
        :chat-id="chatId"
      />
      <div v-else class="messenger__placeholder">
        <BaseIcon name="chat" class="messenger__placeholder-icon" />
        <p>Выберите чат или найдите собеседника по нику</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.messenger {
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) 1fr;
  flex: 1;
  width: 100%;
  max-width: 76rem;
  min-height: 0;
  overflow: hidden;
  border-radius: calc(var(--radius) * 2);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.messenger__sidebar {
  border-right: 1px solid var(--color-border);
}

.messenger__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.messenger__thread {
  flex: 1;
}

.messenger__error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem 0;
}

.messenger__error > :first-child {
  flex: 1;
}

.messenger__error-close {
  border: none;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.messenger__placeholder {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--color-text-muted);
  text-align: center;
}

.messenger__placeholder-icon {
  width: 3rem;
  height: 3rem;
  opacity: 0.5;
}

/* На телефоне одна колонка: список или открытая переписка */
@media (max-width: 40rem) {
  .messenger {
    grid-template-columns: 1fr;
    border-radius: 0;
    box-shadow: none;
  }

  .messenger__sidebar {
    border-right: none;
  }

  .messenger--thread .messenger__sidebar,
  .messenger:not(.messenger--thread) .messenger__main {
    display: none;
  }
}
</style>
