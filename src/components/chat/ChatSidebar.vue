<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { usersApi } from '@/api/users'
import ChatFolderTabs from '@/components/chat/ChatFolderTabs.vue'
import ChatListItem from '@/components/chat/ChatListItem.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { useCallStore } from '@/stores/call'
import { useChatStore } from '@/stores/chat'
import { useChatFoldersStore } from '@/stores/chatFolders'
import type { User } from '@/types/api'

const SEARCH_DELAY_MS = 300

const chatStore = useChatStore()
const folderStore = useChatFoldersStore()
const callStore = useCallStore()
const router = useRouter()

const search = ref('')
const results = ref<User[]>([])
const searching = ref(false)
const searchError = ref('')
const opening = ref<number | null>(null)

const isSearching = computed(() => search.value.trim() !== '')

let searchTimer: ReturnType<typeof setTimeout> | null = null
let requestId = 0

watch(search, (value) => {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
  }
  if (value.trim() === '') {
    results.value = []
    searchError.value = ''
    return
  }
  searchTimer = setTimeout(() => void find(value), SEARCH_DELAY_MS)
})

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
  }
})

async function find(value: string): Promise<void> {
  const current = ++requestId
  searching.value = true
  searchError.value = ''
  try {
    const page = await usersApi.list(value)
    if (current === requestId) {
      results.value = page.items
    }
  } catch {
    if (current === requestId) {
      searchError.value = 'Не удалось найти пользователей.'
    }
  } finally {
    if (current === requestId) {
      searching.value = false
    }
  }
}

async function openChat(user: User): Promise<void> {
  opening.value = user.id
  searchError.value = ''
  try {
    const chat = await chatStore.openWithUser(user)
    search.value = ''
    await router.push({ name: 'chat', params: { id: chat.id } })
  } catch {
    searchError.value = 'Не удалось открыть чат.'
  } finally {
    opening.value = null
  }
}
</script>

<template>
  <aside class="sidebar">
    <header class="sidebar__header">
      <h1 class="sidebar__title">Чаты</h1>
      <nav class="sidebar__nav" aria-label="Разделы">
        <RouterLink
          class="sidebar__link"
          :to="{ name: 'calls' }"
          aria-label="Звонки"
          title="Звонки"
        >
          <BaseIcon name="phone" />
          <span v-if="callStore.missedCount > 0" class="sidebar__dot" aria-hidden="true" />
        </RouterLink>
        <RouterLink
          class="sidebar__link"
          :to="{ name: 'profile' }"
          aria-label="Профиль"
          title="Профиль"
        >
          <BaseIcon name="user" />
        </RouterLink>
      </nav>
    </header>

    <label class="sidebar__search">
      <BaseIcon name="search" class="sidebar__search-icon" />
      <input
        v-model="search"
        class="sidebar__search-input"
        type="search"
        placeholder="Поиск по @нику"
        aria-label="Найти пользователя по нику"
        autocomplete="off"
      />
    </label>

    <ChatFolderTabs v-if="!isSearching" />

    <div class="sidebar__content">
      <template v-if="isSearching">
        <FormAlert :message="searchError" />
        <ul v-if="results.length > 0" class="sidebar__list">
          <li v-for="user in results" :key="user.id">
            <button
              type="button"
              class="sidebar__user"
              :disabled="opening !== null"
              @click="openChat(user)"
            >
              <BaseAvatar
                :name="user.name"
                :src="user.avatar_url"
                :online="callStore.isUserOnline(user.id)"
              />
              <span class="sidebar__user-info">
                <span class="sidebar__user-name">{{ user.name }}</span>
                <span v-if="user.username" class="sidebar__user-meta">@{{ user.username }}</span>
              </span>
              <span v-if="opening === user.id" class="sidebar__spinner" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-else-if="!searching && !searchError" class="sidebar__empty">Никого не нашли.</p>
      </template>

      <template v-else>
        <FormAlert :message="chatStore.listError || folderStore.error" />
        <ul v-if="folderStore.visibleChats.length > 0" class="sidebar__list">
          <li v-for="chat in folderStore.visibleChats" :key="chat.id">
            <ChatListItem :chat="chat" :active="chat.id === chatStore.activeChatId" />
          </li>
        </ul>
        <p v-else-if="folderStore.activeFolder" class="sidebar__empty">
          <template v-if="folderStore.loadingChats">Загружаем…</template>
          <template v-else>
            В папке «{{ folderStore.activeFolder.name }}» пока нет чатов. Откройте чат и нажмите
            значок папки в его шапке.
          </template>
        </p>
        <p v-else-if="chatStore.listLoaded" class="sidebar__empty">
          Переписок пока нет. Найдите собеседника по нику.
        </p>
        <BaseButton
          v-if="folderStore.hasMoreChats"
          variant="ghost"
          :loading="folderStore.loadingChats"
          @click="folderStore.loadMore()"
        >
          Показать ещё
        </BaseButton>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  padding: 1rem 0.75rem;
}

.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.25rem;
}

.sidebar__title {
  margin: 0;
  font-size: 1.375rem;
}

.sidebar__nav {
  display: flex;
  gap: 0.25rem;
}

.sidebar__link {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  color: var(--color-text-muted);
}

.sidebar__link:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.sidebar__dot {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-danger);
}

.sidebar__search {
  position: relative;
  display: flex;
  align-items: center;
}

.sidebar__search-icon {
  position: absolute;
  left: 0.75rem;
  color: var(--color-text-muted);
  pointer-events: none;
}

.sidebar__search-input {
  width: 100%;
  padding: 0.625rem 0.75rem 0.625rem 2.5rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
}

.sidebar__search-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.sidebar__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  overflow-y: auto;
}

.sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sidebar__user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.sidebar__user:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.sidebar__user:disabled {
  cursor: wait;
}

.sidebar__user-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sidebar__user-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__user-meta {
  overflow: hidden;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.sidebar__empty {
  margin: 0;
  padding: 1rem 0.5rem;
  color: var(--color-text-muted);
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
