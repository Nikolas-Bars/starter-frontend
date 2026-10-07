import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import {
  canEditMessage,
  TYPING_NOTIFY_INTERVAL_MS,
  TYPING_VISIBLE_MS,
  useChatStore,
} from '@/stores/chat'
import type { ThreadMessage } from '@/stores/chat'
import type {
  Chat,
  ChatAttachment,
  ChatMessage,
  ChatMessagesPage,
  ChatReadState,
  Paginated,
  User,
} from '@/types/api'
import type { ServerMessage } from '@/types/call'

const fakes = vi.hoisted(() => ({
  listener: null as ((message: ServerMessage) => void) | null,
  notifyTyping: vi.fn<(chatId: number) => void>(),
}))

vi.mock('@/stores/call', () => ({
  useCallStore: () => ({
    onServerMessage: (listener: (message: ServerMessage) => void) => {
      fakes.listener = listener
      return () => undefined
    },
    notifyTyping: fakes.notifyTyping,
  }),
}))

const api = vi.hoisted(() => ({
  list: vi.fn<() => Promise<Paginated<Chat>>>(),
  show: vi.fn<(chatId: number) => Promise<Chat>>(),
  openDirect: vi.fn<(userId: number) => Promise<Chat>>(),
  messages: vi.fn<(chatId: number, beforeId?: number) => Promise<ChatMessagesPage>>(),
  send: vi.fn<
    (
      chatId: number,
      body: string,
      clientId: string,
      attachmentIds?: number[],
    ) => Promise<ChatMessage>
  >(),
  markRead: vi.fn<(chatId: number, messageId: number) => Promise<ChatReadState>>(),
  react: vi.fn<(chatId: number, messageId: number, emoji: string) => Promise<ChatMessage>>(),
  unreact: vi.fn<(chatId: number, messageId: number) => Promise<ChatMessage>>(),
  remove: vi.fn<(chatId: number, messageId: number) => Promise<null>>(),
  forward: vi.fn<(chatId: number, messageId: number, clientId: string) => Promise<ChatMessage>>(),
  edit: vi.fn<(chatId: number, messageId: number, body: string) => Promise<ChatMessage>>(),
  setTranslationNote: vi.fn<(chatId: number, note: string | null) => Promise<Chat>>(),
}))

vi.mock('@/api/chats', () => ({ chatsApi: api }))

const uploads = vi.hoisted(() => ({
  upload:
    vi.fn<
      (
        file: Blob,
        name: string,
        options: { voice?: boolean; asFile?: boolean; onProgress?: (fraction: number) => void },
      ) => Promise<ChatAttachment>
    >(),
}))

vi.mock('@/api/attachments', () => ({ uploadAttachment: uploads.upload }))

const me: User = {
  id: 1,
  name: 'Иван',
  username: 'ivan',
  avatar_url: null,
  locale: 'ru',
  email: 'ivan@example.com',
  email_verified_at: null,
  created_at: null,
  is_guest: false,
}

const maria: User = { ...me, id: 2, name: 'Мария', username: 'maria', email: 'maria@example.com' }

function message(id: number, userId: number, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    chat_id: 7,
    user_id: userId,
    client_id: `client-${id}`,
    type: 'text',
    body: `Сообщение ${id}`,
    body_locale: null,
    translations: {},
    call: null,
    forwarded_from: null,
    reactions: [],
    attachments: [],
    edited_at: null,
    created_at: '2026-10-02T10:00:00+00:00',
    ...overrides,
  }
}

function attachment(id: number, overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    id,
    kind: 'image',
    status: 'processing',
    name: `photo-${id}.jpg`,
    mime: 'image/jpeg',
    size: 1000,
    width: null,
    height: null,
    duration_ms: null,
    waveform: null,
    url: null,
    thumb_url: null,
    ...overrides,
  }
}

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 7,
    type: 'direct',
    peer: maria,
    last_message: message(10, 2),
    unread_count: 1,
    last_read_message_id: 9,
    peer_last_read_message_id: 0,
    translation_note: null,
    created_at: null,
    ...overrides,
  }
}

function lastMessage(store: ReturnType<typeof useChatStore>): ThreadMessage {
  const messages = store.threads[7]!.messages
  return messages[messages.length - 1]!
}

function emit(message: ServerMessage): void {
  fakes.listener?.(message)
}

async function setup(): Promise<ReturnType<typeof useChatStore>> {
  const auth = useAuthStore()
  auth.user = me
  api.list.mockResolvedValueOnce({
    items: [chat()],
    meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 },
  })
  api.messages.mockResolvedValueOnce({ items: [message(9, 1), message(10, 2)], has_more: false })

  const store = useChatStore()
  await store.loadChats()
  await store.loadThread(7)
  return store
}

describe('useChatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    URL.createObjectURL = vi.fn<(object: Blob) => string>(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn<(url: string) => void>()
  })

  it('показывает своё сообщение сразу и заменяет его сохранённым', async () => {
    const store = await setup()
    let resolve: (value: ChatMessage) => void = () => undefined
    api.send.mockReturnValueOnce(new Promise<ChatMessage>((done) => (resolve = done)))

    expect(store.send(7, '  Привет!  ')).toBe(true)

    const pending = lastMessage(store)
    expect(pending).toMatchObject({ id: 0, body: 'Привет!', pending: 'sending', user_id: 1 })
    expect(api.send).toHaveBeenCalledWith(7, 'Привет!', pending.client_id, [])

    resolve(message(11, 1, { client_id: pending.client_id, body: 'Привет!' }))
    await flushPromises()

    expect(store.threads[7]!.messages.map((item) => item.id)).toEqual([9, 10, 11])
    expect(lastMessage(store).pending).toBeUndefined()
    expect(store.chats[7]!.last_message?.id).toBe(11)
    expect(store.chats[7]!.unread_count).toBe(1)
  })

  it('не теряет неотправленное и повторяет с тем же client_id', async () => {
    const store = await setup()
    api.send.mockRejectedValueOnce(new Error('offline'))

    store.send(7, 'Ау')
    await flushPromises()

    const failed = lastMessage(store)
    expect(failed.pending).toBe('failed')

    api.send.mockResolvedValueOnce(message(11, 1, { client_id: failed.client_id, body: 'Ау' }))
    store.retry(7, failed.client_id)
    await flushPromises()

    expect(api.send).toHaveBeenLastCalledWith(7, 'Ау', failed.client_id, [])
    expect(lastMessage(store)).toMatchObject({ id: 11, body: 'Ау' })
  })

  it('принимает сообщение собеседника по сокету один раз', async () => {
    const store = await setup()

    emit({ type: 'chat.message', data: { message: message(12, 2) } })
    emit({ type: 'chat.message', data: { message: message(12, 2) } })
    await flushPromises()

    expect(store.threads[7]!.messages.map((item) => item.id)).toEqual([9, 10, 12])
    expect(store.chats[7]!.unread_count).toBe(2)
    expect(store.chats[7]!.last_message?.id).toBe(12)
  })

  it('загружает чат, которого ещё нет в списке', async () => {
    const store = await setup()
    api.show.mockResolvedValueOnce(chat({ id: 8, last_message: message(20, 3, { chat_id: 8 }) }))

    emit({ type: 'chat.message', data: { message: message(20, 3, { chat_id: 8 }) } })
    await flushPromises()

    expect(api.show).toHaveBeenCalledWith(8)
    expect(store.sortedChats.map((item) => item.id)).toEqual([8, 7])
  })

  it('обновляет отметки прочитанного из сокета', async () => {
    const store = await setup()

    emit({
      type: 'chat.read',
      data: { chat_id: 7, user_id: 2, last_read_message_id: 9, unread_count: 0 },
    })
    expect(store.chats[7]!.peer_last_read_message_id).toBe(9)

    emit({
      type: 'chat.read',
      data: { chat_id: 7, user_id: 1, last_read_message_id: 10, unread_count: 0 },
    })
    expect(store.chats[7]!.last_read_message_id).toBe(10)
    expect(store.chats[7]!.unread_count).toBe(0)
    expect(store.totalUnread).toBe(0)
  })

  it('отмечает прочитанным последнее сообщение и не повторяет запрос', async () => {
    const store = await setup()
    api.markRead.mockResolvedValueOnce({
      chat_id: 7,
      user_id: 1,
      last_read_message_id: 10,
      unread_count: 0,
    })

    await store.markRead(7)
    await store.markRead(7)

    expect(api.markRead).toHaveBeenCalledTimes(1)
    expect(api.markRead).toHaveBeenCalledWith(7, 10)
    expect(store.chats[7]!.unread_count).toBe(0)
    expect(store.chats[7]!.last_read_message_id).toBe(10)
  })

  it('показывает реакцию сразу, заменяет свою и снимает повторным нажатием', async () => {
    const store = await setup()
    const peerLike = { emoji: '👍', user_ids: [2] }
    store.threads[7]!.messages[1]!.reactions = [peerLike]
    let resolve: (value: ChatMessage) => void = () => undefined
    api.react.mockReturnValueOnce(new Promise<ChatMessage>((done) => (resolve = done)))

    void store.react(7, 10, '👍')
    expect(store.threads[7]!.messages[1]!.reactions).toEqual([{ emoji: '👍', user_ids: [2, 1] }])
    expect(api.react).toHaveBeenCalledWith(7, 10, '👍')

    resolve(message(10, 2, { reactions: [{ emoji: '👍', user_ids: [2, 1] }] }))
    await flushPromises()

    api.react.mockResolvedValueOnce(
      message(10, 2, {
        reactions: [peerLike, { emoji: '🔥', user_ids: [1] }],
      }),
    )
    await store.react(7, 10, '🔥')
    expect(store.threads[7]!.messages[1]!.reactions).toEqual([
      peerLike,
      { emoji: '🔥', user_ids: [1] },
    ])

    api.unreact.mockResolvedValueOnce(message(10, 2, { reactions: [peerLike] }))
    await store.react(7, 10, '🔥')
    expect(api.unreact).toHaveBeenCalledWith(7, 10)
    expect(store.threads[7]!.messages[1]!.reactions).toEqual([peerLike])
  })

  it('возвращает реакции как были, если сервер не принял', async () => {
    const store = await setup()
    api.react.mockRejectedValueOnce(new Error('offline'))

    await store.react(7, 10, '❤️')

    expect(store.threads[7]!.messages[1]!.reactions).toEqual([])
  })

  it('применяет реакции собеседника из сокета', async () => {
    const store = await setup()

    emit({
      type: 'chat.reaction',
      data: { chat_id: 7, message_id: 9, reactions: [{ emoji: '😂', user_ids: [2] }] },
    })

    expect(store.threads[7]!.messages[0]!.reactions).toEqual([{ emoji: '😂', user_ids: [2] }])
  })

  it('сообщает, что печатаем, не чаще раза в интервал и сразу после отправки', async () => {
    vi.useFakeTimers()
    const store = await setup()
    api.send.mockReturnValue(new Promise<ChatMessage>(() => undefined))

    store.notifyTyping(7)
    store.notifyTyping(7)
    expect(fakes.notifyTyping).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(TYPING_NOTIFY_INTERVAL_MS)
    store.notifyTyping(7)
    expect(fakes.notifyTyping).toHaveBeenCalledTimes(2)

    store.send(7, 'Готово')
    store.notifyTyping(7)
    expect(fakes.notifyTyping).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('показывает «печатает» собеседника, пока не пришло его сообщение или не вышло время', async () => {
    vi.useFakeTimers()
    const store = await setup()

    emit({ type: 'chat.typing', data: { chat_id: 7, user_id: 2 } })
    expect(store.isTyping(7)).toBe(true)

    emit({ type: 'chat.message', data: { message: message(12, 2) } })
    expect(store.isTyping(7)).toBe(false)

    emit({ type: 'chat.typing', data: { chat_id: 7, user_id: 2 } })
    vi.advanceTimersByTime(TYPING_VISIBLE_MS)
    expect(store.isTyping(7)).toBe(false)

    emit({ type: 'chat.typing', data: { chat_id: 7, user_id: 1 } })
    expect(store.isTyping(7)).toBe(false)
    vi.useRealTimers()
  })

  it('загружает файлы по очереди с прогрессом и отправляет их id', async () => {
    const store = await setup()
    const photo = new File(['x'], 'море.jpg', { type: 'image/jpeg' })
    const voice = new Blob(['y'], { type: 'audio/webm' })
    uploads.upload
      .mockImplementationOnce(async (_file, _name, options) => {
        options.onProgress?.(0.5)
        expect(lastMessage(store).uploads![0]!.progress).toBe(0.5)
        return attachment(31)
      })
      .mockResolvedValueOnce(attachment(32, { kind: 'voice' }))
    api.send.mockImplementationOnce(async (_chatId, body, clientId, ids) =>
      message(11, 1, {
        body,
        client_id: clientId,
        attachments: (ids ?? []).map((id) => attachment(id)),
      }),
    )

    expect(
      store.send(7, '', [
        { file: photo, name: 'море.jpg' },
        { file: voice, name: 'voice.webm', voice: true, durationMs: 1500 },
      ]),
    ).toBe(true)

    const pending = lastMessage(store)
    expect(pending.attachments.map((item) => item.kind)).toEqual(['image', 'voice'])
    expect(pending.attachments[1]!.duration_ms).toBe(1500)

    await flushPromises()

    expect(uploads.upload).toHaveBeenNthCalledWith(
      1,
      photo,
      'море.jpg',
      expect.objectContaining({}),
    )
    expect(uploads.upload).toHaveBeenNthCalledWith(
      2,
      voice,
      'voice.webm',
      expect.objectContaining({ voice: true }),
    )
    expect(api.send).toHaveBeenCalledWith(7, '', pending.client_id, [31, 32])
    expect(lastMessage(store).id).toBe(11)
    expect(lastMessage(store).pending).toBeUndefined()
  })

  it('при повторе не загружает заново то, что уже на сервере', async () => {
    const store = await setup()
    uploads.upload
      .mockResolvedValueOnce(attachment(31))
      .mockRejectedValueOnce(new ApiError('Место для файлов закончилось. Попробуйте позже.', 507))

    store.send(7, 'Смотри', [
      { file: new File(['a'], 'a.jpg', { type: 'image/jpeg' }), name: 'a.jpg' },
      { file: new File(['b'], 'b.pdf', { type: 'application/pdf' }), name: 'b.pdf' },
    ])
    await flushPromises()

    const failed = lastMessage(store)
    expect(failed.pending).toBe('failed')
    expect(failed.error).toBe('Место для файлов закончилось. Попробуйте позже.')
    expect(api.send).not.toHaveBeenCalled()

    uploads.upload.mockResolvedValueOnce(attachment(32, { kind: 'file' }))
    api.send.mockResolvedValueOnce(message(11, 1, { client_id: failed.client_id }))
    store.retry(7, failed.client_id)
    await flushPromises()

    expect(uploads.upload).toHaveBeenCalledTimes(3)
    expect(api.send).toHaveBeenCalledWith(7, 'Смотри', failed.client_id, [31, 32])
  })

  it('подставляет обработанный файл из события chat.attachment', async () => {
    const store = await setup()
    emit({
      type: 'chat.message',
      data: { message: message(12, 2, { body: '', attachments: [attachment(40)] }) },
    })

    const ready = attachment(40, {
      status: 'ready',
      url: '/api/files/a.jpg',
      width: 800,
      height: 600,
    })
    emit({ type: 'chat.attachment', data: { chat_id: 7, message_id: 12, attachment: ready } })

    expect(lastMessage(store).attachments[0]).toEqual(ready)
    expect(store.chats[7]!.last_message?.attachments[0]).toEqual(ready)
  })

  it('удаляет своё сообщение сразу и возвращает его при ошибке', async () => {
    const store = await setup()
    api.remove.mockRejectedValueOnce(new ApiError('Нет связи', 0))

    const deleting = store.deleteMessage(7, 9)
    expect(store.threads[7]!.messages.map((item) => item.id)).toEqual([10])
    await expect(deleting).rejects.toThrow('Нет связи')
    expect(store.threads[7]!.messages.map((item) => item.id)).toEqual([9, 10])

    api.remove.mockResolvedValueOnce(null)
    await store.deleteMessage(7, 9)
    expect(api.remove).toHaveBeenLastCalledWith(7, 9)
    expect(store.threads[7]!.messages.map((item) => item.id)).toEqual([10])
  })

  it('по событию удаления убирает сообщение, меняет последнее и счётчик непрочитанных', async () => {
    const store = await setup()

    emit({
      type: 'chat.message_deleted',
      data: {
        chat_id: 7,
        message_id: 10,
        user_id: 2,
        last_changed: true,
        last_message: message(9, 1),
      },
    })

    expect(store.threads[7]!.messages.map((item) => item.id)).toEqual([9])
    expect(store.chats[7]!.last_message?.id).toBe(9)
    expect(store.chats[7]!.unread_count).toBe(0)
  })

  it('пересланное сообщение попадает в переписку чата-получателя', async () => {
    const store = await setup()
    const forwarded = message(11, 1, { forwarded_from: { user_id: 2, name: 'Мария' } })
    api.forward.mockResolvedValueOnce(forwarded)

    await store.forward(7, 10)

    expect(api.forward).toHaveBeenCalledWith(7, 10, expect.any(String))
    expect(lastMessage(store).forwarded_from).toEqual({ user_id: 2, name: 'Мария' })
    expect(store.chats[7]!.last_message?.id).toBe(11)
  })

  it('меняет текст сразу и возвращает прежний при ошибке', async () => {
    const store = await setup()
    api.edit.mockRejectedValueOnce(new ApiError('Уже ответили', 409))

    const editing = store.editMessage(7, 9, '  Новое  ')
    expect(store.threads[7]!.messages[0]!.body).toBe('Новое')
    await expect(editing).rejects.toThrow('Уже ответили')
    expect(store.threads[7]!.messages[0]).toMatchObject({ body: 'Сообщение 9', edited_at: null })

    api.edit.mockResolvedValueOnce(
      message(9, 1, { body: 'Новое', edited_at: '2026-10-05T10:00:00+00:00' }),
    )
    await store.editMessage(7, 9, 'Новое')
    expect(api.edit).toHaveBeenLastCalledWith(7, 9, 'Новое')
    expect(store.threads[7]!.messages[0]!.edited_at).toBe('2026-10-05T10:00:00+00:00')
  })

  it('по событию изменения обновляет сообщение и последнее в списке', async () => {
    const store = await setup()
    const edited = message(10, 2, { body: 'Исправлено', edited_at: '2026-10-05T10:00:00+00:00' })

    emit({ type: 'chat.message_updated', data: { chat_id: 7, message: edited } })

    expect(lastMessage(store).body).toBe('Исправлено')
    expect(store.chats[7]!.last_message?.body).toBe('Исправлено')
  })

  it('по событию перевода показывает перевод в переписке и в списке', async () => {
    const store = await setup()

    emit({
      type: 'chat.message_translated',
      data: { chat_id: 7, message_id: 10, body_locale: 'vi', translations: { ru: 'Привет' } },
    })

    expect(lastMessage(store)).toMatchObject({ body_locale: 'vi', translations: { ru: 'Привет' } })
    expect(store.chats[7]!.last_message?.translations).toEqual({ ru: 'Привет' })
  })

  it('правка сразу убирает перевод старого текста', async () => {
    const store = await setup()
    const own = store.threads[7]!.messages[0]!
    Object.assign(own, { body_locale: 'ru', translations: { vi: 'Tin nhắn' } })
    api.edit.mockReturnValueOnce(new Promise(() => undefined))

    void store.editMessage(7, 9, 'Новое')

    expect(store.threads[7]!.messages[0]).toMatchObject({ body_locale: null, translations: {} })
  })

  it('заметку для перевода сохраняет на сервере и меняет по событию', async () => {
    const store = await setup()
    api.setTranslationNote.mockResolvedValueOnce(chat({ translation_note: 'Бабушка и внук' }))

    await store.setTranslationNote(7, '  Бабушка и внук  ')

    expect(api.setTranslationNote).toHaveBeenCalledWith(7, 'Бабушка и внук')
    expect(store.chats[7]!.translation_note).toBe('Бабушка и внук')

    emit({ type: 'chat.translation_note', data: { chat_id: 7, translation_note: null } })
    expect(store.chats[7]!.translation_note).toBeNull()
  })

  it('изменить можно своё сообщение, пока на него не ответили', () => {
    const mine = message(9, 1)
    const later = message(11, 1)
    const thread = [mine, message(10, 2), later]

    expect(canEditMessage(thread, mine, 1)).toBe(false)
    expect(canEditMessage(thread, later, 1)).toBe(true)
    expect(canEditMessage(thread, message(10, 2), 1)).toBe(false)
    expect(
      canEditMessage([later], { ...later, forwarded_from: { user_id: 2, name: 'Мария' } }, 1),
    ).toBe(false)
  })
})
