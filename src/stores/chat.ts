import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { chatsApi } from '@/api/chats'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'
import type {
  Chat,
  ChatMessage,
  ChatReaction,
  ChatReactionState,
  ChatReadState,
  User,
} from '@/types/api'
import type { ServerMessage } from '@/types/call'

/** Совпадает с лимитом бэкенда (SendChatMessageRequest::MAX_LENGTH) */
export const MAX_MESSAGE_LENGTH = 4000

/** Тот же набор, что ChatReactionEnum на бэкенде; первая — быстрая реакция по двойному клику */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏', '👎'] as const

/** Пока набираем текст, сообщаем об этом не чаще раза в столько миллисекунд */
export const TYPING_NOTIFY_INTERVAL_MS = 3000
/** Сколько показывать «печатает…» после последнего такого события */
export const TYPING_VISIBLE_MS = 6000

/**
 * Сообщение в переписке. Своё неотправленное живёт с id = 0 и статусом:
 * sending — ждём ответа сервера, failed — не ушло, можно повторить.
 */
export interface ThreadMessage extends ChatMessage {
  pending?: 'sending' | 'failed'
}

export interface Thread {
  messages: ThreadMessage[]
  /** Есть ли на сервере сообщения старше первого загруженного */
  hasMore: boolean
  loading: boolean
  loaded: boolean
  error: string
}

function clientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`.replace('.', '')
}

function emptyThread(): Thread {
  return { messages: [], hasMore: false, loading: false, loaded: false, error: '' }
}

/**
 * Чаты и переписка. Пишем через REST, а новые сообщения и отметки «прочитано»
 * приходят по сокету звонков (useCallStore.onServerMessage).
 */
export const useChatStore = defineStore('chat', () => {
  const auth = useAuthStore()
  const callStore = useCallStore()

  const chats = ref<Record<number, Chat>>({})
  const threads = ref<Record<number, Thread>>({})
  const listLoaded = ref(false)
  const listLoading = ref(false)
  const listError = ref('')
  const listPage = ref(1)
  const listLastPage = ref(1)
  /** Открытый сейчас чат: в списке он виден, даже если переписки ещё нет */
  const activeChatId = ref<number | null>(null)

  /** Какой id уже отправлен как прочитанный — чтобы не слать одно и то же */
  const readRequested = new Map<number, number>()
  /** Номер последнего запроса реакции по id сообщения: ответы на устаревшие игнорируем */
  const reactionRequests = new Map<number, number>()
  /** Кто сейчас печатает в чате: id чата → id собеседника */
  const typing = ref<Record<number, number>>({})
  const typingTimers = new Map<number, ReturnType<typeof setTimeout>>()
  /** Когда мы последний раз сообщили, что печатаем, по id чата */
  const typingNotifiedAt = new Map<number, number>()

  const sortedChats = computed(() =>
    Object.values(chats.value)
      .filter((chat) => chat.last_message !== null || chat.id === activeChatId.value)
      // Чат без сообщений (только что открыли) — сверху, остальные по последнему сообщению
      .sort((a, b) => (b.last_message?.id ?? Infinity) - (a.last_message?.id ?? Infinity)),
  )

  const totalUnread = computed(() =>
    Object.values(chats.value).reduce((sum, chat) => sum + chat.unread_count, 0),
  )

  callStore.onServerMessage((message) => void handle(message))

  function myId(): number | null {
    return auth.user?.id ?? null
  }

  function upsertChat(chat: Chat): Chat {
    chats.value[chat.id] = chat
    return chats.value[chat.id]!
  }

  /** Чаты, загруженные отдельно (например, страница папки) */
  function addChats(list: Chat[]): void {
    list.forEach(upsertChat)
  }

  function thread(chatId: number): Thread {
    threads.value[chatId] ??= emptyThread()
    return threads.value[chatId]
  }

  async function loadChats(): Promise<void> {
    listLoading.value = true
    listError.value = ''
    try {
      const page = await chatsApi.list(1)
      const fresh: Record<number, Chat> = {}
      // Открытый чат без переписки сервер не отдаёт — сохраняем его
      const active = activeChatId.value === null ? undefined : chats.value[activeChatId.value]
      if (active !== undefined) {
        fresh[active.id] = active
      }
      page.items.forEach((chat) => (fresh[chat.id] = chat))
      chats.value = fresh
      listPage.value = page.meta.current_page
      listLastPage.value = page.meta.last_page
      listLoaded.value = true
    } catch {
      listError.value = 'Не удалось загрузить чаты.'
    } finally {
      listLoading.value = false
    }
  }

  async function loadMoreChats(): Promise<void> {
    if (listLoading.value || listPage.value >= listLastPage.value) {
      return
    }
    listLoading.value = true
    try {
      const page = await chatsApi.list(listPage.value + 1)
      page.items.forEach(upsertChat)
      listPage.value = page.meta.current_page
      listLastPage.value = page.meta.last_page
    } catch {
      listError.value = 'Не удалось загрузить чаты.'
    } finally {
      listLoading.value = false
    }
  }

  /** Личный чат с пользователем (существующий или новый) */
  async function openWithUser(user: User): Promise<Chat> {
    return upsertChat(await chatsApi.openDirect(user.id))
  }

  /** Чат из адресной строки или из события по сокету, которого ещё нет в списке */
  async function ensureChat(chatId: number): Promise<Chat | null> {
    const known = chats.value[chatId]
    if (known !== undefined) {
      return known
    }
    try {
      return upsertChat(await chatsApi.show(chatId))
    } catch {
      return null
    }
  }

  async function loadThread(chatId: number): Promise<void> {
    const current = thread(chatId)
    if (current.loaded || current.loading) {
      return
    }
    current.loading = true
    current.error = ''
    try {
      const page = await chatsApi.messages(chatId)
      // Пока грузили, могли прийти сообщения по сокету — объединяем
      current.messages = merge(page.items, current.messages)
      current.hasMore = page.has_more
      current.loaded = true
    } catch {
      current.error = 'Не удалось загрузить сообщения.'
    } finally {
      current.loading = false
    }
  }

  async function loadOlder(chatId: number): Promise<void> {
    const current = thread(chatId)
    const oldest = current.messages.find((message) => message.id > 0)
    if (!current.hasMore || current.loading || oldest === undefined) {
      return
    }
    current.loading = true
    try {
      const page = await chatsApi.messages(chatId, oldest.id)
      current.messages = merge(page.items, current.messages)
      current.hasMore = page.has_more
    } catch {
      current.error = 'Не удалось загрузить сообщения.'
    } finally {
      current.loading = false
    }
  }

  /** @returns false — текст пустой */
  function send(chatId: number, text: string): boolean {
    const body = text.trim().slice(0, MAX_MESSAGE_LENGTH)
    const authorId = myId()
    if (body === '' || authorId === null) {
      return false
    }

    const local: ThreadMessage = {
      id: 0,
      chat_id: chatId,
      user_id: authorId,
      client_id: clientId(),
      type: 'text',
      body,
      call: null,
      reactions: [],
      created_at: new Date().toISOString(),
      pending: 'sending',
    }
    const current = thread(chatId)
    current.messages = [...current.messages, local]
    // Следующее нажатие клавиши — уже новое сообщение: о нём сообщаем сразу
    typingNotifiedAt.delete(chatId)
    void deliver(local)
    return true
  }

  /** Пользователь набирает текст в чате: собеседник увидит «печатает…» */
  function notifyTyping(chatId: number): void {
    const now = Date.now()
    if (now - (typingNotifiedAt.get(chatId) ?? 0) < TYPING_NOTIFY_INTERVAL_MS) {
      return
    }
    typingNotifiedAt.set(chatId, now)
    callStore.notifyTyping(chatId)
  }

  function showTyping(chatId: number, userId: number): void {
    clearTimeout(typingTimers.get(chatId))
    typing.value[chatId] = userId
    typingTimers.set(
      chatId,
      setTimeout(() => hideTyping(chatId), TYPING_VISIBLE_MS),
    )
  }

  function hideTyping(chatId: number): void {
    clearTimeout(typingTimers.get(chatId))
    typingTimers.delete(chatId)
    delete typing.value[chatId]
  }

  function isTyping(chatId: number): boolean {
    return typing.value[chatId] !== undefined
  }

  function retry(chatId: number, messageClientId: string): void {
    const local = thread(chatId).messages.find(
      (message) => message.client_id === messageClientId && message.pending === 'failed',
    )
    if (local !== undefined) {
      local.pending = 'sending'
      void deliver(local)
    }
  }

  async function deliver(local: ThreadMessage): Promise<void> {
    try {
      receive(await chatsApi.send(local.chat_id, local.body, local.client_id))
    } catch {
      const current = thread(local.chat_id).messages.find(
        (message) => message.client_id === local.client_id && message.id === 0,
      )
      if (current !== undefined) {
        current.pending = 'failed'
      }
    }
  }

  /**
   * Отмечает прочитанным последнее сообщение собеседника в загруженной переписке.
   * Вызывать, когда переписку действительно видно.
   */
  async function markRead(chatId: number): Promise<void> {
    const chat = chats.value[chatId]
    const me = myId()
    if (chat === undefined || me === null) {
      return
    }

    const latest = thread(chatId).messages.reduce(
      (max, message) => (message.user_id !== me && message.id > max ? message.id : max),
      0,
    )
    const latestKnown = Math.max(latest, chat.last_message?.id ?? 0)
    if (
      latestKnown <= chat.last_read_message_id ||
      (readRequested.get(chatId) ?? 0) >= latestKnown
    ) {
      return
    }

    readRequested.set(chatId, latestKnown)
    // Счётчик сбрасываем сразу, не дожидаясь сервера
    chat.unread_count = 0
    try {
      applyRead(await chatsApi.markRead(chatId, latestKnown))
    } catch {
      readRequested.delete(chatId)
    }
  }

  function setActive(chatId: number | null): void {
    activeChatId.value = chatId
  }

  /**
   * Ставит свою реакцию или снимает её, если нажали ту же. Показываем сразу,
   * при ошибке возвращаем как было.
   */
  async function react(chatId: number, messageId: number, emoji: string): Promise<void> {
    const me = myId()
    const message = thread(chatId).messages.find((item) => item.id === messageId)
    if (me === null || message === undefined || messageId === 0) {
      return
    }

    const previous = message.reactions
    const removing = previous.some((group) => group.emoji === emoji && group.user_ids.includes(me))
    message.reactions = withReaction(previous, me, removing ? null : emoji)

    const request = (reactionRequests.get(messageId) ?? 0) + 1
    reactionRequests.set(messageId, request)
    try {
      const saved = removing
        ? await chatsApi.unreact(chatId, messageId)
        : await chatsApi.react(chatId, messageId, emoji)
      if (reactionRequests.get(messageId) === request) {
        applyReactions({ chat_id: chatId, message_id: messageId, reactions: saved.reactions })
      }
    } catch {
      if (reactionRequests.get(messageId) === request) {
        message.reactions = previous
      }
    } finally {
      if (reactionRequests.get(messageId) === request) {
        reactionRequests.delete(messageId)
      }
    }
  }

  function applyReactions(state: ChatReactionState): void {
    const message = threads.value[state.chat_id]?.messages.find(
      (item) => item.id === state.message_id,
    )
    if (message !== undefined) {
      message.reactions = state.reactions
    }
    const last = chats.value[state.chat_id]?.last_message
    if (last?.id === state.message_id) {
      last.reactions = state.reactions
    }
  }

  async function handle(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        // После обрыва связи могли пропустить события: перечитываем то, что на экране
        if (listLoaded.value) {
          await loadChats()
        }
        if (activeChatId.value !== null) {
          await refreshThread(activeChatId.value)
        }
        return
      case 'chat.message':
        if (chats.value[message.data.message.chat_id] === undefined) {
          // Новый чат: сервер посчитает и непрочитанные, и последнее сообщение
          await ensureChat(message.data.message.chat_id)
          addToThread(message.data.message)
          return
        }
        receive(message.data.message)
        return
      case 'chat.read':
        applyRead(message.data)
        return
      case 'chat.reaction':
        // Пока ждём ответа на свою реакцию, событие может принести состояние до неё
        if (!reactionRequests.has(message.data.message_id)) {
          applyReactions(message.data)
        }
        return
      case 'chat.typing':
        if (message.data.user_id !== myId()) {
          showTyping(message.data.chat_id, message.data.user_id)
        }
        return
    }
  }

  /** Сообщение сохранено на сервере: своё (ответ на отправку, другая вкладка) или собеседника */
  function receive(message: ChatMessage): void {
    const chat = chats.value[message.chat_id]
    const isNew = addToThread(message)

    if (typing.value[message.chat_id] === message.user_id) {
      hideTyping(message.chat_id)
    }

    if (chat === undefined) {
      return
    }
    if (chat.last_message === null || chat.last_message.id < message.id) {
      chat.last_message = message
    }
    if (message.user_id === myId()) {
      chat.last_read_message_id = Math.max(chat.last_read_message_id, message.id)
    } else if (isNew && message.id > chat.last_read_message_id) {
      chat.unread_count += 1
    }
  }

  /** @returns false — это сообщение уже было в переписке */
  function addToThread(message: ChatMessage): boolean {
    const current = threads.value[message.chat_id]
    if (current === undefined) {
      return true
    }
    const index = current.messages.findIndex(
      (existing) =>
        existing.id === message.id ||
        (existing.client_id === message.client_id && existing.user_id === message.user_id),
    )
    if (index !== -1) {
      const wasPending = current.messages[index]!.id === 0
      current.messages[index] = message
      return wasPending
    }
    current.messages = merge(current.messages, [message])
    return true
  }

  function applyRead(state: ChatReadState): void {
    const chat = chats.value[state.chat_id]
    if (chat === undefined) {
      return
    }
    if (state.user_id === myId()) {
      if (state.last_read_message_id >= chat.last_read_message_id) {
        chat.last_read_message_id = state.last_read_message_id
        chat.unread_count = state.unread_count
      }
    } else {
      chat.peer_last_read_message_id = Math.max(
        chat.peer_last_read_message_id,
        state.last_read_message_id,
      )
    }
  }

  async function refreshThread(chatId: number): Promise<void> {
    const current = threads.value[chatId]
    if (current === undefined || !current.loaded) {
      return
    }
    try {
      const page = await chatsApi.messages(chatId)
      current.messages = merge(current.messages, page.items)
    } catch {
      // Покажем то, что есть; следующее событие или переоткрытие чата догрузят остальное
    }
  }

  function reset(): void {
    chats.value = {}
    threads.value = {}
    listLoaded.value = false
    listPage.value = 1
    listLastPage.value = 1
    activeChatId.value = null
    readRequested.clear()
    reactionRequests.clear()
    typingTimers.forEach((timer) => clearTimeout(timer))
    typingTimers.clear()
    typingNotifiedAt.clear()
    typing.value = {}
  }

  return {
    chats,
    threads,
    sortedChats,
    totalUnread,
    listLoaded,
    listLoading,
    listError,
    hasMoreChats: computed(() => listPage.value < listLastPage.value),
    activeChatId,
    loadChats,
    loadMoreChats,
    addChats,
    openWithUser,
    ensureChat,
    loadThread,
    loadOlder,
    send,
    retry,
    markRead,
    react,
    notifyTyping,
    isTyping,
    setActive,
    reset,
  }
})

/** Реакции после того, как пользователь поставил emoji (null — снял свою) */
function withReaction(
  reactions: ChatReaction[],
  userId: number,
  emoji: string | null,
): ChatReaction[] {
  const result = reactions
    .map((group) => ({ ...group, user_ids: group.user_ids.filter((id) => id !== userId) }))
    .filter((group) => group.user_ids.length > 0 || group.emoji === emoji)
  if (emoji === null) {
    return result
  }
  const target = result.find((group) => group.emoji === emoji)
  if (target === undefined) {
    result.push({ emoji, user_ids: [userId] })
  } else {
    target.user_ids.push(userId)
  }
  return result
}

/**
 * Объединяет сохранённые сообщения (по id) и сохраняет порядок: сохранённые по возрастанию id,
 * неотправленные — в конце, как их отправляли.
 */
function merge(first: ThreadMessage[], second: ThreadMessage[]): ThreadMessage[] {
  const saved = new Map<number, ThreadMessage>()
  const pending: ThreadMessage[] = []
  const savedClientIds = new Set<string>()

  for (const message of [...first, ...second]) {
    if (message.id > 0) {
      saved.set(message.id, message)
      savedClientIds.add(`${message.user_id}:${message.client_id}`)
    }
  }
  for (const message of [...first, ...second]) {
    const key = `${message.user_id}:${message.client_id}`
    if (message.id === 0 && !savedClientIds.has(key)) {
      savedClientIds.add(key)
      pending.push(message)
    }
  }

  return [...[...saved.values()].sort((a, b) => a.id - b.id), ...pending]
}
