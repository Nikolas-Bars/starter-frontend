import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useChatFoldersStore } from '@/stores/chatFolders'
import type { Chat, ChatFolder, ChatMessage, Paginated, User } from '@/types/api'
import type { ServerMessage } from '@/types/call'

const listeners = vi.hoisted(() => [] as ((message: ServerMessage) => void)[])

vi.mock('@/stores/call', () => ({
  useCallStore: () => ({
    onServerMessage: (listener: (message: ServerMessage) => void) => {
      listeners.push(listener)
      return () => undefined
    },
  }),
}))

const api = vi.hoisted(() => ({
  chats: {
    list: vi.fn<(page?: number, folderId?: number) => Promise<Paginated<Chat>>>(),
    show: vi.fn<(chatId: number) => Promise<Chat>>(),
  },
  folders: {
    list: vi.fn<() => Promise<ChatFolder[]>>(),
    create: vi.fn<(name: string) => Promise<ChatFolder>>(),
    rename: vi.fn<(folderId: number, name: string) => Promise<ChatFolder>>(),
    remove: vi.fn<(folderId: number) => Promise<null>>(),
    addChat: vi.fn<(folderId: number, chatId: number) => Promise<ChatFolder>>(),
    removeChat: vi.fn<(folderId: number, chatId: number) => Promise<ChatFolder>>(),
  },
}))

vi.mock('@/api/chats', () => ({ chatsApi: api.chats, chatFoldersApi: api.folders }))

const me: User = {
  id: 1,
  name: 'Иван',
  username: 'ivan',
  email: 'ivan@example.com',
  email_verified_at: null,
  created_at: null,
  is_guest: false,
}

function lastMessage(chatId: number, id: number): ChatMessage {
  return {
    id,
    chat_id: chatId,
    user_id: 2,
    client_id: `client-${id}`,
    type: 'text',
    body: 'Привет',
    call: null,
    reactions: [],
    created_at: null,
  }
}

function chat(id: number, unread: number): Chat {
  return {
    id,
    type: 'direct',
    peer: { ...me, id: id + 100, name: `Собеседник ${id}` },
    last_message: lastMessage(id, id * 10),
    unread_count: unread,
    last_read_message_id: 0,
    peer_last_read_message_id: 0,
    created_at: null,
  }
}

function page(items: Chat[]): Paginated<Chat> {
  return { items, meta: { current_page: 1, last_page: 1, per_page: 30, total: items.length } }
}

const work: ChatFolder = { id: 3, name: 'Работа', chat_ids: [7, 9], unread_chats_count: 2 }

function emit(message: ServerMessage): void {
  listeners.forEach((listener) => listener(message))
}

async function setup(): Promise<ReturnType<typeof useChatFoldersStore>> {
  useAuthStore().user = me
  api.chats.list.mockResolvedValueOnce(page([chat(7, 1), chat(8, 0)]))
  api.folders.list.mockResolvedValueOnce([{ ...work }])
  await useChatStore().loadChats()
  const store = useChatFoldersStore()
  await store.load()
  return store
}

describe('useChatFoldersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    listeners.length = 0
  })

  it('показывает чаты папки и догружает те, которых нет в общем списке', async () => {
    const store = await setup()
    // Чата 9 нет в общем списке: пока он не загружен, верим счётчику сервера
    expect(store.unreadChats(store.folders[0]!)).toBe(2)

    api.chats.list.mockResolvedValueOnce(page([chat(7, 1), chat(9, 0)]))
    await store.select(3)

    expect(api.chats.list).toHaveBeenLastCalledWith(1, 3)
    expect(store.visibleChats.map((item) => item.id)).toEqual([9, 7])
    // Теперь все чаты папки известны — считаем сами
    expect(store.unreadChats(store.folders[0]!)).toBe(1)

    await store.select(null)
    expect(store.visibleChats.map((item) => item.id)).toEqual([9, 8, 7])
  })

  it('кладёт чат в папку сразу и откатывает при ошибке', async () => {
    const store = await setup()
    api.folders.addChat.mockRejectedValueOnce(new Error('offline'))

    const pending = store.toggleChat(3, 8)
    expect(store.folders[0]!.chat_ids).toEqual([7, 9, 8])
    await pending

    expect(store.folders[0]!.chat_ids).toEqual([7, 9])
    expect(store.error).toBe('Не удалось изменить папку.')

    api.folders.removeChat.mockResolvedValueOnce({ ...work, chat_ids: [9] })
    await store.toggleChat(3, 7)
    expect(api.folders.removeChat).toHaveBeenCalledWith(3, 7)
    expect(store.foldersOf(7)).toEqual([])
  })

  it('уходит во «Все», если открытую папку удалили', async () => {
    const store = await setup()
    api.chats.list.mockResolvedValueOnce(page([]))
    await store.select(3)
    api.folders.remove.mockResolvedValueOnce(null)

    expect(await store.remove(3)).toBe('')

    expect(store.folders).toEqual([])
    expect(store.activeFolderId).toBeNull()
  })

  it('перечитывает папки, когда их поменяли в другой вкладке', async () => {
    const store = await setup()
    api.folders.list.mockResolvedValueOnce([{ ...work, name: 'Коллеги' }])

    emit({ type: 'chat.folders', data: [] })
    await flushPromises()

    expect(store.folders[0]!.name).toBe('Коллеги')
  })
})
