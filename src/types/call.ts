import type { Call, CallStatus } from '@/types/api'

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
  | { type: 'call.accept' | 'call.reject' | 'call.hangup'; data: { call_id: number } }
  | { type: SignalType; data: { call_id: number; payload: SignalPayload } }

export type ServerMessage =
  | { type: 'ready'; data: { user_id: number } }
  | { type: 'pong' }
  | { type: 'call.ringing' | 'call.incoming' | 'call.accepted'; data: { call: Call } }
  | { type: 'call.ended'; data: { call: Call; reason: CallEndReason } }
  | { type: SignalType; data: { call_id: number; payload: SignalPayload } }
  | { type: 'error'; data: { request: string | null; message: string } }
