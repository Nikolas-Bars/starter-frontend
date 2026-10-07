<script setup lang="ts">
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { t } from '@/i18n'
import { useChatFoldersStore } from '@/stores/chatFolders'

const folderStore = useChatFoldersStore()

function badge(count: number): string {
  return count > 99 ? '99+' : String(count)
}
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="t('chats.folders.tabsLabel')">
    <button
      type="button"
      role="tab"
      class="tabs__tab"
      :class="{ 'tabs__tab--active': folderStore.activeFolderId === null }"
      :aria-selected="folderStore.activeFolderId === null"
      @click="folderStore.select(null)"
    >
      {{ t('chats.folders.all') }}
      <span v-if="folderStore.allUnreadChats > 0" class="tabs__badge">
        {{ badge(folderStore.allUnreadChats) }}
      </span>
    </button>
    <button
      v-for="folder in folderStore.folders"
      :key="folder.id"
      type="button"
      role="tab"
      class="tabs__tab"
      :class="{ 'tabs__tab--active': folderStore.activeFolderId === folder.id }"
      :aria-selected="folderStore.activeFolderId === folder.id"
      @click="folderStore.select(folder.id)"
    >
      {{ folder.name }}
      <span v-if="folderStore.unreadChats(folder) > 0" class="tabs__badge">
        {{ badge(folderStore.unreadChats(folder)) }}
      </span>
    </button>
    <button
      type="button"
      class="tabs__manage"
      :aria-label="
        t(folderStore.folders.length === 0 ? 'chats.folders.create' : 'chats.folders.manage')
      "
      :title="t(folderStore.folders.length === 0 ? 'chats.folders.create' : 'chats.folders.manage')"
      @click="folderStore.managerOpen = true"
    >
      <BaseIcon :name="folderStore.folders.length === 0 ? 'plus' : 'sliders'" />
      <span v-if="folderStore.folders.length === 0">{{ t('chats.folders.folder') }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.25rem 0.125rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs__tab,
.tabs__manage {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.tabs__tab:hover,
.tabs__manage:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.tabs__tab--active,
.tabs__tab--active:hover {
  border-color: transparent;
  background: var(--color-primary-soft);
  color: var(--color-accent-text);
}

.tabs__manage {
  padding: 0 0.625rem;
}

.tabs__badge {
  min-width: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-accent);
  font-size: 0.6875rem;
  line-height: 1.125rem;
  text-align: center;
}
</style>
