<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import BaseIcon from '@/components/ui/BaseIcon.vue'
import { useChatFoldersStore } from '@/stores/chatFolders'

const props = defineProps<{ chatId: number }>()

const folderStore = useChatFoldersStore()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const inAnyFolder = computed(() => folderStore.foldersOf(props.chatId).length > 0)

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

function manage(): void {
  open.value = false
  folderStore.managerOpen = true
}
</script>

<template>
  <div ref="root" class="menu">
    <button
      type="button"
      class="menu__trigger"
      :class="{ 'menu__trigger--active': inAnyFolder }"
      aria-label="Папки этого чата"
      title="Папки"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <BaseIcon name="folder" />
    </button>
    <div v-if="open" class="menu__popup" role="menu" aria-label="Папки">
      <button
        v-for="folder in folderStore.folders"
        :key="folder.id"
        type="button"
        role="menuitemcheckbox"
        class="menu__item"
        :aria-checked="folder.chat_ids.includes(chatId)"
        @click="folderStore.toggleChat(folder.id, chatId)"
      >
        <span class="menu__check">
          <BaseIcon v-if="folder.chat_ids.includes(chatId)" name="check" />
        </span>
        <span class="menu__label">{{ folder.name }}</span>
      </button>
      <p v-if="folderStore.folders.length === 0" class="menu__empty">Папок пока нет</p>
      <button type="button" role="menuitem" class="menu__item menu__item--manage" @click="manage">
        <span class="menu__check">
          <BaseIcon :name="folderStore.folders.length === 0 ? 'plus' : 'sliders'" />
        </span>
        <span class="menu__label">
          {{ folderStore.folders.length === 0 ? 'Создать папку' : 'Настроить папки' }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
}

.menu__trigger {
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

.menu__trigger:hover {
  background: var(--color-surface-muted);
}

.menu__trigger--active {
  color: var(--color-accent-text);
}

.menu__popup {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 13rem;
  max-height: 20rem;
  padding: 0.375rem;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.menu__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border: none;
  border-radius: calc(var(--radius) / 2);
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.menu__item:hover {
  background: var(--color-surface-muted);
}

.menu__item--manage {
  margin-top: 0.25rem;
  border-top: 1px solid var(--color-border);
  border-radius: 0;
  color: var(--color-text-muted);
}

.menu__check {
  display: inline-flex;
  width: 1.25rem;
  color: var(--color-accent-text);
}

.menu__item--manage .menu__check {
  color: inherit;
}

.menu__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu__empty {
  margin: 0;
  padding: 0.5rem 0.625rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
</style>
