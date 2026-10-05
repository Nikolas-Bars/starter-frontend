import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { uploadAttachment } from '@/api/attachments'
import { chatsApi } from '@/api/chats'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useCallStore } from '@/stores/call'
import type {
  Chat,
  ChatAttachment,
  ChatAttachmentState,
  ChatMessage,
  ChatMessageDeletedState,
  ChatReaction,
  ChatReactionState,
  ChatReadState,
  User,
} from '@/types/api'
import type { ServerMessage } from '@/types/call'
import { guessKind } from '@/utils/chatAttachment'

/** Совпадает с лимитом бэкенда (SendChatMessageRequest::MAX_LENGTH) */
export const MAX_MESSAGE_LENGTH = 4000

/** Тот же набор, что ChatReactionEnum на бэкенде; первая — быстрая реакция по двойному клику */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏', '👎'] as const

/** Пока набираем текст, сообщаем об этом не чаще раза в столько миллисекунд */
export const TYPING_NOTIFY_INTERVAL_MS = 3000
/** Сколько показывать «печатает…» после последнего такого события */
export const TYPING_VISIBLE_MS = 6000

/** Файл, который пользователь отправляет */
export interface OutgoingFile {
  file: Blob
  name: string
  /** Записанное голосовое */
  voice?: boolean
  /** Без сжатия */
  asFile?: boolean
  /** Длительность записанного голосового — показать, пока оно загружается */
  durationMs?: number
}

/** Загрузка своего файла, пока сообщение не отправлено */
export interface LocalUpload {
  source: OutgoingFile
  /** Доля отправленного, 0–1 */
  progress: number
  /** Файл уже на сервере: при повторе заново не загружается */
  attachmentId: number | null
}

/**
 * Сообщение в переписке. Своё неотправленное живёт с id = 0 и статусом:
 * sending — ждём ответа сервера, failed — не ушло, можно повторить.
 */
export interface ThreadMessage extends ChatMessage {
  pending?: 'sending' | 'failed'
  /** Свои файлы неотправленного сообщения, в том же порядке, что attachments */
  uploads?: LocalUpload[]
  /** Почему не ушло, если сервер объяснил (например, кончилось место) */
  error?: string
}

export interface Thread {
  messages: ThreadMessage[]
  /** Есть ли на сервере сообщения старше первого загруженного */
  hasMore: boolean
  loading: boolean
  loaded: boolean
  error: string
}

/**
 * Своё текстовое сообщение (не пересланное) можно изменить, пока на него не ответили:
 * после него в переписке нет ничего от других участников
 */
export function canEditMessage(
  messages: ThreadMessage[],
  message: ThreadMessage,
  myId: number | null,
): boolean {
  if (
    message.user_id !== myId ||
    message.id === 0 ||
    message.type !== 'text' ||
    message.forwarded_from !== null ||
    (message.body === '' && message.attachments.length === 0)
  ) {
    return false
  }
  return !messages.some((item) => item.id > message.id && item.user_id !== myId)
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
  /**
   * Свои фото и видео из памяти браузера по id вложения: показываем их, пока сервер сжимает файл,
   * а для отправленных — пока не загрузилась картинка с сервера
   */
  const previews = ref<Record<number, string>>({})
  const localPreviewUrls = new Set<string>()

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

  /** @returns false — нечего отправлять */
  function send(chatId: number, text: string, files: OutgoingFile[] = []): boolean {
    const body = text.trim().slice(0, MAX_MESSAGE_LENGTH)
    const authorId = myId()
    if ((body === '' && files.length === 0) || authorId === null) {
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
      forwarded_from: null,
      edited_at: null,
      reactions: [],
      attachments: files.map(localAttachment),
      uploads: files.map((source) => ({ source, progress: 0, attachmentId: null })),
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
      local.error = undefined
      void deliver(local)
    }
  }

  /** Заглушка своего файла: пока он загружается, показываем его из памяти браузера */
  function localAttachment(source: OutgoingFile, index: number): ChatAttachment {
    const kind = source.voice ? 'voice' : guessKind(source.file as File, source.asFile)
    let url: string | null = null
    if ((kind === 'image' || kind === 'video') && typeof URL.createObjectURL === 'function') {
      url = URL.createObjectURL(source.file)
      localPreviewUrls.add(url)
    }
    return {
      id: -(index + 1),
      kind,
      status: 'processing',
      name: source.name,
      mime: source.file.type,
      size: source.file.size,
      width: null,
      height: null,
      duration_ms: source.durationMs ?? null,
      waveform: null,
      url,
      thumb_url: null,
    }
  }

  async function deliver(local: ThreadMessage): Promise<void> {
    // Менять надо реактивную копию из переписки, а не исходный объект
    const live = (): ThreadMessage | undefined =>
      thread(local.chat_id).messages.find(
        (message) => message.client_id === local.client_id && message.id === 0,
      )

    try {
      const uploads = live()?.uploads ?? []
      for (const [index, upload] of uploads.entries()) {
        if (upload.attachmentId !== null) {
          continue
        }
        const saved = await uploadAttachment(upload.source.file, upload.source.name, {
          voice: upload.source.voice,
          asFile: upload.source.asFile,
          onProgress: (fraction) => (upload.progress = fraction),
        })
        upload.attachmentId = saved.id
        upload.progress = 1
        const preview = live()?.attachments[index]?.url
        if (preview) {
          previews.value[saved.id] = preview
        }
      }
      receive(
        await chatsApi.send(
          local.chat_id,
          local.body,
          local.client_id,
          uploads.map((upload) => upload.attachmentId!),
        ),
      )
    } catch (error) {
      const current = live()
      if (current !== undefined) {
        current.pending = 'failed'
        // Сеть и сбои сервера — «повторить»; отказ по существу (места нет, файл велик) — показать текст
        const explained =
          error instanceof ApiError &&
          ((error.status >= 400 && error.status < 500) || error.status === 507)
        current.error = explained ? error.message : undefined
      }
    }
  }

  /** Своё фото или видео из памяти браузера, пока сервер его не обработал */
  function previewOf(attachmentId: number): string | null {
    return previews.value[attachmentId] ?? null
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

  /** Удаляет своё сообщение у всех. Убираем сразу, при ошибке возвращаем и бросаем её дальше */
  async function deleteMessage(chatId: number, messageId: number): Promise<void> {
    const current = threads.value[chatId]
    const message = current?.messages.find((item) => item.id === messageId)
    if (current === undefined || message === undefined || messageId === 0) {
      return
    }
    current.messages = current.messages.filter((item) => item.id !== messageId)
    try {
      await chatsApi.remove(chatId, messageId)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return
      }
      current.messages = merge(current.messages, [message])
      throw error
    }
  }

  /** Меняет текст своего сообщения. Показываем сразу, при ошибке возвращаем прежний и бросаем её дальше */
  async function editMessage(chatId: number, messageId: number, body: string): Promise<void> {
    const message = threads.value[chatId]?.messages.find((item) => item.id === messageId)
    const text = body.trim()
    if (message === undefined || messageId === 0 || text === '' || text === message.body) {
      return
    }
    const previous = { body: message.body, edited_at: message.edited_at }
    message.body = text
    message.edited_at = new Date().toISOString()
    try {
      applyUpdated(await chatsApi.edit(chatId, messageId, text))
    } catch (error) {
      Object.assign(message, previous)
      throw error
    }
  }

  function applyUpdated(message: ChatMessage): void {
    const current = threads.value[message.chat_id]
    if (current !== undefined) {
      current.messages = current.messages.map((item) => (item.id === message.id ? message : item))
    }
    const chat = chats.value[message.chat_id]
    if (chat?.last_message?.id === message.id) {
      chat.last_message = message
    }
  }

  /** Пересылает сообщение в чат targetChatId; новое сообщение придёт в переписку как обычное */
  async function forward(targetChatId: number, messageId: number): Promise<void> {
    const message = await chatsApi.forward(targetChatId, messageId, clientId())
    if (chats.value[targetChatId] === undefined) {
      await ensureChat(targetChatId)
    }
    receive(message)
  }

  function applyDeleted(state: ChatMessageDeletedState): void {
    const current = threads.value[state.chat_id]
    if (current !== undefined) {
      current.messages = current.messages.filter((item) => item.id !== state.message_id)
    }
    const chat = chats.value[state.chat_id]
    if (chat === undefined) {
      return
    }
    if (state.last_changed) {
      chat.last_message = state.last_message
    }
    if (
      state.user_id !== myId() &&
      state.message_id > chat.last_read_message_id &&
      chat.unread_count > 0
    ) {
      chat.unread_count -= 1
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
      case 'chat.attachment':
        applyAttachment(message.data)
        return
      case 'chat.reaction':
        // Пока ждём ответа на свою реакцию, событие может принести состояние до неё
        if (!reactionRequests.has(message.data.message_id)) {
          applyReactions(message.data)
        }
        return
      case 'chat.message_deleted':
        applyDeleted(message.data)
        return
      case 'chat.message_updated':
        applyUpdated(message.data.message)
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

  function applyAttachment(state: ChatAttachmentState): void {
    const update = (message: ChatMessage | null | undefined): void => {
      if (message?.id === state.message_id) {
        message.attachments = message.attachments.map((attachment) =>
          attachment.id === state.attachment.id ? state.attachment : attachment,
        )
      }
    }
    update(threads.value[state.chat_id]?.messages.find((item) => item.id === state.message_id))
    update(chats.value[state.chat_id]?.last_message)
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
      // Сообщения из того же диапазона, которых больше нет на сервере, удалили, пока не было связи
      const ids = new Set(page.items.map((item) => item.id))
      const oldest = Math.min(...ids)
      const kept = current.messages.filter(
        (item) => item.id === 0 || item.id < oldest || ids.has(item.id),
      )
      current.messages = merge(kept, page.items)
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
    localPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
    localPreviewUrls.clear()
    previews.value = {}
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
    previewOf,
    markRead,
    react,
    deleteMessage,
    editMessage,
    forward,
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
