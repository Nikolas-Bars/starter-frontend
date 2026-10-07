<script setup lang="ts">
import { ref, watch } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import FormAlert from '@/components/ui/FormAlert.vue'
import { t } from '@/i18n'
import { MAX_FOLDER_NAME_LENGTH, MAX_FOLDERS, useChatFoldersStore } from '@/stores/chatFolders'

const folderStore = useChatFoldersStore()

const dialog = ref<HTMLDialogElement | null>(null)
const newName = ref('')
const creating = ref(false)
const error = ref('')
/** Черновики названий: сохраняем, когда поле теряет фокус или по Enter */
const drafts = ref<Record<number, string>>({})

watch(
  () => folderStore.managerOpen,
  (open) => {
    if (open) {
      error.value = ''
      drafts.value = Object.fromEntries(
        folderStore.folders.map((folder) => [folder.id, folder.name]),
      )
      dialog.value?.showModal()
    } else {
      dialog.value?.close()
    }
  },
)

watch(
  () => folderStore.folders,
  (folders) => {
    for (const folder of folders) {
      drafts.value[folder.id] ??= folder.name
    }
  },
)

async function create(): Promise<void> {
  const name = newName.value.trim()
  if (name === '' || creating.value) {
    return
  }
  creating.value = true
  error.value = await folderStore.create(name)
  if (error.value === '') {
    newName.value = ''
  }
  creating.value = false
}

async function rename(folderId: number): Promise<void> {
  const folder = folderStore.folders.find((item) => item.id === folderId)
  const name = (drafts.value[folderId] ?? '').trim()
  if (folder === undefined || name === folder.name) {
    return
  }
  if (name === '') {
    drafts.value[folderId] = folder.name
    return
  }
  error.value = await folderStore.rename(folderId, name)
  if (error.value !== '') {
    drafts.value[folderId] = folder.name
  }
}

async function remove(folderId: number): Promise<void> {
  error.value = await folderStore.remove(folderId)
}
</script>

<template>
  <dialog
    ref="dialog"
    class="folders"
    aria-labelledby="folders-title"
    @close="folderStore.managerOpen = false"
  >
    <header class="folders__header">
      <h2 id="folders-title" class="folders__title">{{ t('chats.folders.title') }}</h2>
      <button
        type="button"
        class="folders__close"
        :aria-label="t('common.close')"
        @click="folderStore.managerOpen = false"
      >
        <BaseIcon name="close" />
      </button>
    </header>

    <i18n-t keypath="chats.folders.hint" tag="p" class="folders__hint">
      <template #icon>
        <BaseIcon name="folder" class="folders__inline-icon" />
      </template>
    </i18n-t>

    <FormAlert :message="error" />

    <ul v-if="folderStore.folders.length > 0" class="folders__list">
      <li v-for="folder in folderStore.folders" :key="folder.id" class="folders__row">
        <BaseIcon name="folder" class="folders__icon" />
        <input
          v-model="drafts[folder.id]"
          class="folders__input"
          :maxlength="MAX_FOLDER_NAME_LENGTH"
          :aria-label="t('chats.folders.nameOf', { name: folder.name })"
          @blur="rename(folder.id)"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span
          class="folders__count"
          :title="t('chats.folders.chatsCount', { count: folder.chat_ids.length })"
        >
          {{ folder.chat_ids.length }}
        </span>
        <button
          type="button"
          class="folders__delete"
          :aria-label="t('chats.folders.removeNamed', { name: folder.name })"
          :title="t('chats.folders.removeHint')"
          @click="remove(folder.id)"
        >
          <BaseIcon name="trash" />
        </button>
      </li>
    </ul>

    <form class="folders__create" @submit.prevent="create">
      <input
        v-model="newName"
        class="folders__input folders__input--new"
        :placeholder="t('chats.folders.namePlaceholder')"
        :aria-label="t('chats.folders.newName')"
        :maxlength="MAX_FOLDER_NAME_LENGTH"
        :disabled="folderStore.folders.length >= MAX_FOLDERS"
        @keydown.enter.prevent="create"
      />
      <BaseButton
        type="submit"
        icon="plus"
        :loading="creating"
        :disabled="newName.trim() === '' || folderStore.folders.length >= MAX_FOLDERS"
      >
        {{ t('chats.folders.add') }}
      </BaseButton>
    </form>
    <p v-if="folderStore.folders.length >= MAX_FOLDERS" class="folders__hint">
      {{ t('chats.folders.limit', { count: MAX_FOLDERS }) }}
    </p>
  </dialog>
</template>

<style scoped>
.folders {
  width: min(28rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 1.25rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow);
}

.folders::backdrop {
  background: var(--color-overlay);
}

.folders__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.folders__title {
  margin: 0;
  font-size: 1.25rem;
}

.folders__close,
.folders__delete {
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

.folders__close:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.folders__delete:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
}

.folders__hint {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.folders__inline-icon {
  vertical-align: -0.2em;
}

.folders__list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.folders__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.folders__icon {
  color: var(--color-text-muted);
}

.folders__input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.625rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
}

.folders__input:hover {
  border-color: var(--color-border);
}

.folders__input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.folders__input--new {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}

.folders__count {
  min-width: 1.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  text-align: end;
}

.folders__create {
  display: flex;
  gap: 0.5rem;
}

.folders__create .button {
  padding-block: 0.5rem;
}
</style>
