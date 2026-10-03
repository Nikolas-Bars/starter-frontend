import type {
  Call,
  CallStatus,
  ChatAttachmentState,
  ChatMessage,
  ChatReactionState,
  ChatReadState,
} from '@/types/api'

/**
 * Протокол сигнализации с WebSocket-сервером бэкенда (app/Modules/Call/WebSockets/MessageRouter.php).
 * Каждое сообщение — JSON вида { type, data }.
 */

export type SignalType = 'signal.offer' | 'signal.answer' | 'signal.ice'

/** SDP-описание (offer/answer) или ICE-кандидат — сервер пересылает их собеседнику как есть */
export type SignalPayload = RTCSessionDescriptionInit | RTCIceCandidateInit

/** Почему звонок закончился: финальный статус звонка или «приняли в другой вкладке» */
export type CallEndReason = Exclude<CallStatus, 'ringing' | 'active'> | 'answered_elsewhere'

export type ClientMessage =
  | { type: 'ping' }
  | { type: 'call.invite'; data: { callee_id: number } }
  | {
      type: 'call.accept' | 'call.reject' | 'call.hangup' | 'call.resume'
      data: { call_id: number }
    }
  | { type: SignalType; data: { call_id: number; payload: SignalPayload } }
  | { type: 'chat.typing'; data: { chat_id: number } }

export type ServerMessage =
  | { type: 'ready'; data: { user_id: number } }
  | { type: 'pong' }
  | {
      type: 'call.ringing' | 'call.incoming' | 'call.accepted' | 'call.resumed'
      data: { call: Call }
    }
  | { type: 'call.ended'; data: { call: Call; reason: CallEndReason } }
  | { type: SignalType; data: { call_id: number; payload: SignalPayload } }
  | { type: 'presence.snapshot'; data: { user_ids: number[] } }
  | { type: 'presence.changed'; data: { user_id: number; online: boolean } }
  | { type: 'error'; data: { request: string | null; message: string } }
  /** События чатов: сервер пересылает их из API (RealtimeBus) всем вкладкам участников */
  | { type: 'chat.message'; data: { message: ChatMessage } }
  | { type: 'chat.read'; data: ChatReadState }
  | { type: 'chat.reaction'; data: ChatReactionState }
  | { type: 'chat.attachment'; data: ChatAttachmentState }
  /** Собеседник набирает сообщение; сервер пересылает это сразу и нигде не хранит */
  | { type: 'chat.typing'; data: { chat_id: number; user_id: number } }
  /** Папки изменились в другой вкладке: перечитать */
  | { type: 'chat.folders'; data: unknown }

/** Что включено у стороны звонка */
export interface MediaState {
  mic: boolean
  camera: boolean
  screen: boolean
}

/** Сообщения между браузерами по прямому каналу данных, мимо сервера */
export type PeerMessage =
  ({ type: 'media' } & MediaState) | { type: 'chat'; id: string; text: string; sent_at: string }
