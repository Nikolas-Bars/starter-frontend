import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError } from '@/api/http'
import { chatFoldersApi, chatsApi } from '@/api/chats'
import { useCallStore } from '@/stores/call'
import { useChatStore } from '@/stores/chat'
import type { Chat, ChatFolder } from '@/types/api'

/** Совпадает с лимитами бэкенда (CreateChatFolderAction, ChatFolderRequest) */
export const MAX_FOLDERS = 20
export const MAX_FOLDER_NAME_LENGTH = 32

interface FolderPaging {
  page: number
  lastPage: number
  loading: boolean
}

/**
 * Личные папки чатов («Друзья», «Работа»). Список чатов папки — это общий список,
 * отфильтрованный по chat_ids; чаты папки, которых ещё нет в общем списке, догружаем.
 */
export const useChatFoldersStore = defineStore('chatFolders', () => {
  const chatStore = useChatStore()
  const callStore = useCallStore()

  const folders = ref<ChatFolder[]>([])
  const loaded = ref(false)
  const error = ref('')
  /** null — «Все чаты» */
  const activeFolderId = ref<number | null>(null)
  const paging = ref<Record<number, FolderPaging>>({})
  /** Окно управления папками */
  const managerOpen = ref(false)

  const activeFolder = computed(
    () => folders.value.find((folder) => folder.id === activeFolderId.value) ?? null,
  )

  const visibleChats = computed<Chat[]>(() => {
    const folder = activeFolder.value
    if (folder === null) {
      return chatStore.sortedChats
    }
    const ids = new Set(folder.chat_ids)
    return chatStore.sortedChats.filter((chat) => ids.has(chat.id))
  })

  const hasMoreChats = computed(() => {
    const folder = activeFolder.value
    if (folder === null) {
      return chatStore.hasMoreChats
    }
    const state = paging.value[folder.id]
    return state !== undefined && state.page > 0 && state.page < state.lastPage
  })

  const loadingChats = computed(() => {
    const folder = activeFolder.value
    return folder === null ? chatStore.listLoading : (paging.value[folder.id]?.loading ?? false)
  })

  callStore.onServerMessage((message) => {
    if (message.type === 'chat.folders' || (message.type === 'ready' && loaded.value)) {
      void load()
    }
  })

  /**
   * Сколько чатов папки с непрочитанным. Если все её чаты уже загружены — считаем сами
   * (так счётчик живёт вместе с событиями), иначе берём число сервера.
   */
  function unreadChats(folder: ChatFolder): number {
    const known = folder.chat_ids.map((id) => chatStore.chats[id])
    if (known.some((chat) => chat === undefined)) {
      return folder.unread_chats_count
    }
    return known.filter((chat) => (chat?.unread_count ?? 0) > 0).length
  }

  const allUnreadChats = computed(
    () => Object.values(chatStore.chats).filter((chat) => chat.unread_count > 0).length,
  )

  function foldersOf(chatId: number): ChatFolder[] {
    return folders.value.filter((folder) => folder.chat_ids.includes(chatId))
  }

  async function load(): Promise<void> {
    error.value = ''
    try {
      folders.value = await chatFoldersApi.list()
      loaded.value = true
      if (activeFolderId.value !== null && activeFolder.value === null) {
        activeFolderId.value = null
      }
    } catch {
      error.value = 'Не удалось загрузить папки.'
    }
  }

  async function select(folderId: number | null): Promise<void> {
    activeFolderId.value = folderId
    if (folderId !== null && paging.value[folderId] === undefined) {
      await loadFolderPage(folderId, 1)
    }
  }

  async function loadMore(): Promise<void> {
    const folder = activeFolder.value
    if (folder === null) {
      await chatStore.loadMoreChats()
      return
    }
    const state = paging.value[folder.id]
    if (state !== undefined && !state.loading && state.page < state.lastPage) {
      await loadFolderPage(folder.id, state.page + 1)
    }
  }

  async function loadFolderPage(folderId: number, page: number): Promise<void> {
    const state = (paging.value[folderId] ??= { page: 0, lastPage: 1, loading: false })
    state.loading = true
    try {
      const result = await chatsApi.list(page, folderId)
      chatStore.addChats(result.items)
      state.page = result.meta.current_page
      state.lastPage = result.meta.last_page
    } catch {
      error.value = 'Не удалось загрузить чаты папки.'
    } finally {
      state.loading = false
    }
  }

  /** @returns текст ошибки или '' */
  async function create(name: string): Promise<string> {
    try {
      folders.value = [...folders.value, await chatFoldersApi.create(name)]
      return ''
    } catch (exception) {
      return errorText(exception, 'Не удалось создать папку.')
    }
  }

  /** @returns текст ошибки или '' */
  async function rename(folderId: number, name: string): Promise<string> {
    try {
      replace(await chatFoldersApi.rename(folderId, name))
      return ''
    } catch (exception) {
      return errorText(exception, 'Не удалось переименовать папку.')
    }
  }

  /** @returns текст ошибки или '' */
  async function remove(folderId: number): Promise<string> {
    try {
      await chatFoldersApi.remove(folderId)
      folders.value = folders.value.filter((folder) => folder.id !== folderId)
      if (activeFolderId.value === folderId) {
        activeFolderId.value = null
      }
      return ''
    } catch (exception) {
      return errorText(exception, 'Не удалось удалить папку.')
    }
  }

  /** Добавляет чат в папку или убирает оттуда; показываем сразу, при ошибке откатываем */
  async function toggleChat(folderId: number, chatId: number): Promise<void> {
    const folder = folders.value.find((item) => item.id === folderId)
    if (folder === undefined) {
      return
    }
    const previous = folder.chat_ids
    const included = previous.includes(chatId)
    folder.chat_ids = included ? previous.filter((id) => id !== chatId) : [...previous, chatId]
    try {
      replace(
        included
          ? await chatFoldersApi.removeChat(folderId, chatId)
          : await chatFoldersApi.addChat(folderId, chatId),
      )
    } catch {
      folder.chat_ids = previous
      error.value = 'Не удалось изменить папку.'
    }
  }

  function replace(updated: ChatFolder): void {
    folders.value = folders.value.map((folder) => (folder.id === updated.id ? updated : folder))
  }

  function reset(): void {
    folders.value = []
    loaded.value = false
    error.value = ''
    activeFolderId.value = null
    paging.value = {}
    managerOpen.value = false
  }

  return {
    folders,
    loaded,
    error,
    activeFolderId,
    activeFolder,
    visibleChats,
    hasMoreChats,
    loadingChats,
    allUnreadChats,
    managerOpen,
    unreadChats,
    foldersOf,
    load,
    select,
    loadMore,
    create,
    rename,
    remove,
    toggleChat,
    reset,
  }
})

function errorText(exception: unknown, fallback: string): string {
  if (exception instanceof ApiError) {
    return Object.values(exception.errors)[0]?.[0] ?? exception.message
  }
  return fallback
}
