import { http } from '@/api/http'
import type {
  Chat,
  ChatFolder,
  ChatMessage,
  ChatMessagesPage,
  ChatReadState,
  Paginated,
} from '@/types/api'

export const chatsApi = {
  /** С folderId — только чаты этой папки */
  list: (page = 1, folderId?: number) =>
    http.get<Paginated<Chat>>(
      `chats?page=${page}${folderId === undefined ? '' : `&folder_id=${folderId}`}`,
    ),
  show: (chatId: number) => http.get<Chat>(`chats/${chatId}`),
  /** Личный чат с пользователем: существующий или новый */
  openDirect: (userId: number) => http.post<Chat>('chats/direct', { user_id: userId }),
  messages: (chatId: number, beforeId?: number) =>
    http.get<ChatMessagesPage>(
      `chats/${chatId}/messages${beforeId === undefined ? '' : `?before_id=${beforeId}`}`,
    ),
  /** Повтор с тем же clientId не создаёт дубль */
  send: (chatId: number, body: string, clientId: string) =>
    http.post<ChatMessage>(`chats/${chatId}/messages`, { body, client_id: clientId }),
  markRead: (chatId: number, messageId: number) =>
    http.post<ChatReadState>(`chats/${chatId}/read`, { message_id: messageId }),
  /** Своя реакция на сообщение: новая заменяет прежнюю */
  react: (chatId: number, messageId: number, emoji: string) =>
    http.put<ChatMessage>(`chats/${chatId}/messages/${messageId}/reaction`, { emoji }),
  unreact: (chatId: number, messageId: number) =>
    http.delete<ChatMessage>(`chats/${chatId}/messages/${messageId}/reaction`),
}

export const chatFoldersApi = {
  list: () => http.get<ChatFolder[]>('chat-folders'),
  create: (name: string) => http.post<ChatFolder>('chat-folders', { name }),
  rename: (folderId: number, name: string) =>
    http.patch<ChatFolder>(`chat-folders/${folderId}`, { name }),
  remove: (folderId: number) => http.delete<null>(`chat-folders/${folderId}`),
  addChat: (folderId: number, chatId: number) =>
    http.put<ChatFolder>(`chat-folders/${folderId}/chats/${chatId}`),
  removeChat: (folderId: number, chatId: number) =>
    http.delete<ChatFolder>(`chat-folders/${folderId}/chats/${chatId}`),
}
