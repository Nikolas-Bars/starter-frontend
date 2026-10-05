/** Единый формат ответа бэкенда: { status, message, data, errors } */
export interface ApiResponse<T> {
  status: 'success' | 'error'
  message: string
  data: T
  errors: ValidationErrors
}

/** Ошибки валидации: поле => список сообщений */
export type ValidationErrors = Record<string, string[]>

export interface User {
  id: number
  name: string
  /** Ник без @, только по нему пользователя находят в поиске */
  username: string | null
  /** Подписанная относительная ссылка на аватарку (/api/files/…), null — показываем инициалы */
  avatar_url: string | null
  /** Только у текущего пользователя (вход, профиль), у остальных null */
  email: string | null
  email_verified_at: string | null
  created_at: string | null
  /** Гость по ссылке для звонка: email у него технический, показывать его не нужно */
  is_guest: boolean
}

/** PATCH /api/profile */
export interface UpdateProfilePayload {
  name: string
  /** null или пустая строка — убрать ник */
  username: string | null
}

export interface ChatMessage {
  id: number
  chat_id: number
  /** Автор */
  user_id: number
  /** UUID, выбранный отправителем: по нему своё сообщение находится после ответа сервера */
  client_id: string
  /** call — служебное сообщение о звонке (автор — звонивший), body у него пустой */
  type: 'text' | 'call'
  body: string
  /** Пересланное: автор оригинала (имя на момент пересылки; user_id пуст, если автора удалили) */
  forwarded_from: { user_id: number | null; name: string } | null
  call: ChatMessageCall | null
  /** В порядке, в каком реакции впервые появились */
  reactions: ChatReaction[]
  /** Файлы сообщения; тогда body — необязательная подпись */
  attachments: ChatAttachment[]
  /** Автор менял текст; null — не менял */
  edited_at: string | null
  created_at: string | null
}

export type ChatAttachmentKind = 'image' | 'video' | 'voice' | 'file'

/**
 * Файл в сообщении: POST /api/attachments. Ссылки относительные и подписанные,
 * действуют до конца следующих суток (UTC)
 */
export interface ChatAttachment {
  id: number
  kind: ChatAttachmentKind
  /** processing — ещё сжимается, готовый придёт событием chat.attachment */
  status: 'processing' | 'ready' | 'failed'
  /** Имя у отправителя */
  name: string
  mime: string
  /** Байт */
  size: number
  width: number | null
  height: number | null
  duration_ms: number | null
  /** Голосовые: громкость по отрезкам, 0–100 */
  waveform: number[] | null
  url: string | null
  /** Превью фото и кадр видео */
  thumb_url: string | null
}

/** Событие chat.attachment: файл в уже отправленном сообщении обработан */
export interface ChatAttachmentState {
  chat_id: number
  message_id: number
  attachment: ChatAttachment
}

export interface ChatMessageCall {
  id: number
  status: Exclude<CallStatus, 'ringing' | 'active'>
  /** Длительность разговора; null, если не ответили */
  duration_seconds: number | null
}

/** Одна реакция на сообщение и кто её поставил; у пользователя на сообщении не больше одной */
export interface ChatReaction {
  emoji: string
  user_ids: number[]
}

/** Событие chat.reaction: реакции сообщения целиком */
export interface ChatReactionState {
  chat_id: number
  message_id: number
  reactions: ChatReaction[]
}

/** Событие chat.message_deleted: автор удалил сообщение у всех */
export interface ChatMessageDeletedState {
  chat_id: number
  message_id: number
  /** Автор удалённого сообщения */
  user_id: number
  /** Удалили последнее сообщение чата: тогда last_message — новое последнее (null — сообщений не осталось) */
  last_changed: boolean
  last_message: ChatMessage | null
}

/** Папка чатов: GET /api/chat-folders. Видна только владельцу */
export interface ChatFolder {
  id: number
  name: string
  chat_ids: number[]
  /** Сколько чатов папки с непрочитанным */
  unread_chats_count: number
}

/** Чат глазами текущего пользователя: GET /api/chats, GET /api/chats/{id}, POST /api/chats/direct */
export interface Chat {
  id: number
  type: 'direct'
  peer: User | null
  last_message: ChatMessage | null
  unread_count: number
  /** Докуда прочитал текущий пользователь; 0 — ничего */
  last_read_message_id: number
  /** Свои сообщения с id не больше этого собеседник прочитал */
  peer_last_read_message_id: number
  created_at: string | null
}

/** GET /api/chats/{id}/messages: от старых к новым */
export interface ChatMessagesPage {
  items: ChatMessage[]
  /** Есть ли сообщения старше первого из items */
  has_more: boolean
}

/** POST /api/chats/{id}/read и событие chat.read */
export interface ChatReadState {
  chat_id: number
  user_id: number
  last_read_message_id: number
  /** Сколько непрочитанных осталось у user_id */
  unread_count: number
}

/** GET /api/call-link: своя ссылка; адрес — {origin}/c/{code} */
export interface CallLink {
  code: string
  updated_at: string | null
}

/** GET /api/call-links/{code}: чужая ссылка — кому позвонит гость */
export interface CallLinkInvite {
  code: string
  owner: { id: number; name: string }
}

export interface JoinCallLinkPayload {
  name: string
}

/** Страница списка: GET /api/users, GET /api/calls, GET /api/chats */
export interface Paginated<T> {
  items: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export type CallStatus =
  'ringing' | 'active' | 'rejected' | 'missed' | 'busy' | 'unavailable' | 'ended'

export interface Call {
  id: number
  status: CallStatus
  caller: User
  callee: User
  started_at: string
  answered_at: string | null
  ended_at: string | null
  /** Длительность разговора; null, если не ответили */
  duration_seconds: number | null
}

/** Элемент RTCConfiguration.iceServers из GET /api/calls/ice-servers */
export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

/** POST /api/calls/ws-ticket: одноразовый пропуск на подключение к серверу звонков */
export interface WebSocketTicket {
  ticket: string
  expires_in: number
}

export interface AuthToken {
  access_token: string
  token_type: 'Bearer'
  expires_at: string | null
  user: User
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  /** Обязателен: латиница, цифры и _, 3–32 символа (регистр и ведущий @ сервер убирает) */
  username: string
  email: string
  password: string
  password_confirmation: string
}
