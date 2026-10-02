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
  /** Ник без @, по нему (и по email) пользователя находят в поиске */
  username: string | null
  email: string
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
  call: ChatMessageCall | null
  /** В порядке, в каком реакции впервые появились */
  reactions: ChatReaction[]
  created_at: string | null
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
  email: string
  password: string
  password_confirmation: string
}
