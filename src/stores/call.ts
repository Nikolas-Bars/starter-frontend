import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { callsApi } from '@/api/calls'
import { ApiError } from '@/api/http'
import { MediaAccessError, usePeerConnection } from '@/composables/usePeerConnection'
import { defaultSignalingUrl, SignalingSocket, type SocketStatus } from '@/realtime/socket'
import { useAuthStore } from '@/stores/auth'
import { useCallSettingsStore } from '@/stores/callSettings'
import type { Call, User } from '@/types/api'
import type {
  CallEndReason,
  PeerMessage,
  ServerMessage,
  SignalPayload,
  SignalType,
} from '@/types/call'

/**
 * idle → outgoing (звоним, ждём ответа) | incoming (звонят нам)
 *      → connecting (ответили, браузеры устанавливают прямое соединение)
 *      → active (разговор) → ended (итог показывается несколько секунд) → idle
 */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended'

export interface ChatMessage {
  id: string
  mine: boolean
  text: string
  sentAt: string
}

export interface CallMediaOptions {
  /** false — только голос, камера не запрашивается */
  video?: boolean
}

const ENDED_SCREEN_MS = 4000

/** Сколько ждём восстановления связи (сеть, сервер звонков), прежде чем завершить разговор */
export const RECONNECT_GRACE_MS = 20000

export const MAX_CHAT_MESSAGE_LENGTH = 1000

const MISSED_STORAGE_KEY = 'missed_calls'

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

function loadMissedIds(): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(MISSED_STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : []
  } catch {
    return []
  }
}

function messageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export const useCallStore = defineStore('call', () => {
  const auth = useAuthStore()
  const settings = useCallSettingsStore()
  const socket = new SignalingSocket(defaultSignalingUrl(), {
    issueTicket: async () => {
      try {
        return (await callsApi.webSocketTicket()).ticket
      } catch (reason) {
        if (reason instanceof ApiError && reason.isUnauthorized) {
          return null
        }
        throw reason
      }
    },
  })
  const peer = usePeerConnection()

  const phase = ref<CallPhase>('idle')
  const call = ref<Call | null>(null)
  const counterpart = ref<User | null>(null)
  const direction = ref<'outgoing' | 'incoming'>('outgoing')
  const endMessage = ref('')
  const error = ref('')
  const socketStatus = ref<SocketStatus>(socket.status)
  /** Когда установилась связь — для таймера разговора */
  const activeSince = ref<number | null>(null)
  /** Растёт после каждого звонка: история звонков перезагружается */
  const historyVersion = ref(0)
  const onlineUserIds = ref<ReadonlySet<number>>(new Set())
  /** Пропущенные входящие, которые пользователь ещё не видел; общие для всех вкладок */
  const missedCallIds = ref<number[]>(loadMissedIds())
  const chatMessages = ref<ChatMessage[]>([])
  const chatOpen = ref(false)
  const unreadChat = ref(0)
  /** Разговор идёт, но пропала связь с сервером звонков */
  const socketLost = ref(false)
  /** Разговор идёт, но оборвалось прямое соединение с собеседником */
  const mediaLost = ref(false)

  const isBusy = computed(() => phase.value !== 'idle' && phase.value !== 'ended')
  const isOnline = computed(() => socketStatus.value === 'open')
  const missedCount = computed(() => missedCallIds.value.length)
  const reconnecting = computed(
    () => phase.value === 'active' && (socketLost.value || mediaLost.value),
  )

  let iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS
  let dismissTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let hungUpLocally = false

  socket.onStatus((status) => {
    socketStatus.value = status
    if (status !== 'open') {
      onlineUserIds.value = new Set()
    }

    if (!isBusy.value || (status !== 'closed' && status !== 'unauthorized')) {
      return
    }

    // Разговор не рвём сразу: видео идёт напрямую, а сокет обычно переподключается за секунды
    if (status === 'closed' && phase.value === 'active' && call.value !== null) {
      socketLost.value = true
      waitForReconnect()
      return
    }

    finish('Соединение с сервером звонков потеряно')
  })

  /** Остальные события сокета (чаты) обрабатывают другие сторы — через onServerMessage */
  const serverListeners = new Set<(message: ServerMessage) => void>()

  socket.onMessage((message) => {
    void handle(message).catch(() => connectionFailed())
    serverListeners.forEach((listener) => listener(message))
  })

  watch(peer.connectionState, (state) => {
    if (state === 'connected') {
      if (phase.value === 'connecting') {
        phase.value = 'active'
        activeSince.value = Date.now()
      }
      mediaLost.value = false
      settleReconnect()
      return
    }

    if (state !== 'disconnected' && state !== 'failed') {
      return
    }

    if (phase.value === 'active') {
      mediaLost.value = true
      waitForReconnect()
      if (state === 'failed') {
        restartIce()
      }
    } else if (state === 'failed' && isBusy.value) {
      connectionFailed()
    }
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === MISSED_STORAGE_KEY) {
        missedCallIds.value = loadMissedIds()
      }
    })
  }

  watch(missedCallIds, (ids) => localStorage.setItem(MISSED_STORAGE_KEY, JSON.stringify(ids)))

  function connect(token: string): void {
    socket.connect(token)
  }

  function disconnect(): void {
    if (isBusy.value) {
      hangup()
    }
    socket.disconnect()
  }

  async function startCall(user: User, media: CallMediaOptions = {}): Promise<void> {
    if (isBusy.value) {
      return
    }

    resetCall()
    direction.value = 'outgoing'
    counterpart.value = user
    phase.value = 'outgoing'

    try {
      await prepareMedia(media)
    } catch (reason) {
      fail(reason)
      return
    }

    // Пока браузер спрашивал доступ к камере, звонок могли отменить
    if (phase.value !== 'outgoing') {
      return
    }

    if (!socket.send({ type: 'call.invite', data: { callee_id: user.id } })) {
      fail('Нет связи с сервером звонков. Попробуйте через несколько секунд.')
    }
  }

  async function accept(media: CallMediaOptions = {}): Promise<void> {
    const incoming = call.value
    if (phase.value !== 'incoming' || incoming === null) {
      return
    }

    phase.value = 'connecting'

    try {
      await prepareMedia(media)
    } catch (reason) {
      socket.send({ type: 'call.reject', data: { call_id: incoming.id } })
      fail(reason)
      return
    }

    if (call.value?.id !== incoming.id || phase.value !== 'connecting') {
      return
    }

    createPeerConnection()
    socket.send({ type: 'call.accept', data: { call_id: incoming.id } })
  }

  function reject(): void {
    if (phase.value === 'incoming' && call.value !== null) {
      endByMe('call.reject', call.value.id)
    }
  }

  function hangup(): void {
    if (!isBusy.value) {
      return
    }

    if (call.value === null) {
      // Сервер ещё не подтвердил вызов: отменяем локально, а пришедший call.ringing сбросим
      hungUpLocally = true
      finish('Вызов отменён')
      return
    }

    endByMe('call.hangup', call.value.id)
  }

  function toggleMic(): void {
    peer.setMicEnabled(!peer.micEnabled.value)
  }

  async function toggleCamera(): Promise<void> {
    try {
      await peer.setCameraEnabled(!peer.cameraEnabled.value)
    } catch (reason) {
      error.value =
        reason instanceof MediaAccessError ? reason.message : 'Не удалось включить камеру.'
    }
  }

  async function toggleScreenShare(): Promise<void> {
    try {
      if (peer.screenSharing.value) {
        await peer.stopScreenShare()
      } else {
        await peer.startScreenShare()
      }
    } catch (reason) {
      // Пользователь закрыл окно выбора экрана — это не ошибка
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
        return
      }
      error.value =
        reason instanceof MediaAccessError
          ? 'Этот браузер не умеет показывать экран.'
          : 'Не удалось показать экран.'
    }
  }

  async function selectDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
    if (kind === 'audiooutput') {
      settings.audioOutputId = deviceId
      return
    }

    if (kind === 'audioinput') {
      settings.audioInputId = deviceId
    } else {
      settings.videoInputId = deviceId
    }

    if (peer.localStream.value === null) {
      return
    }

    try {
      await peer.switchDevice(kind === 'audioinput' ? 'audio' : 'video', deviceId)
    } catch (reason) {
      error.value =
        reason instanceof MediaAccessError ? reason.message : 'Не удалось переключить устройство.'
    }
  }

  function sendChat(text: string): boolean {
    const trimmed = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH)
    if (trimmed === '' || phase.value !== 'active') {
      return false
    }

    const message = {
      type: 'chat' as const,
      id: messageId(),
      text: trimmed,
      sent_at: new Date().toISOString(),
    }
    if (!peer.sendMessage(message)) {
      return false
    }

    chatMessages.value = [
      ...chatMessages.value,
      { id: message.id, mine: true, text: trimmed, sentAt: message.sent_at },
    ]
    return true
  }

  function setChatOpen(open: boolean): void {
    chatOpen.value = open
    if (open) {
      unreadChat.value = 0
    }
  }

  /** Подписка на все сообщения сервера; сокет по-прежнему один, и владеет им этот стор */
  /** Сообщить, что пользователь печатает: без гарантии доставки, без ответа */
  function notifyTyping(chatId: number): void {
    socket.send({ type: 'chat.typing', data: { chat_id: chatId } })
  }

  function onServerMessage(listener: (message: ServerMessage) => void): () => void {
    serverListeners.add(listener)
    return () => serverListeners.delete(listener)
  }

  function isUserOnline(userId: number): boolean {
    return onlineUserIds.value.has(userId)
  }

  function clearMissed(): void {
    if (missedCallIds.value.length > 0) {
      missedCallIds.value = []
    }
  }

  function dismiss(): void {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    if (phase.value === 'ended') {
      resetCall()
      phase.value = 'idle'
    }
  }

  function clearError(): void {
    error.value = ''
  }

  async function handle(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        if (socketLost.value && call.value !== null) {
          socket.send({ type: 'call.resume', data: { call_id: call.value.id } })
        }
        return

      case 'presence.snapshot':
        onlineUserIds.value = new Set(message.data.user_ids)
        return

      case 'presence.changed': {
        const online = new Set(onlineUserIds.value)
        if (message.data.online) {
          online.add(message.data.user_id)
        } else {
          online.delete(message.data.user_id)
        }
        onlineUserIds.value = online
        return
      }

      case 'call.resumed':
        if (isCurrent(message.data.call.id)) {
          socketLost.value = false
          settleReconnect()
          if (mediaLost.value) {
            restartIce()
          }
        }
        return

      case 'call.ringing':
        if (phase.value !== 'outgoing' || call.value !== null) {
          socket.send({ type: 'call.hangup', data: { call_id: message.data.call.id } })
          return
        }
        call.value = message.data.call
        return

      case 'call.incoming':
        if (isBusy.value) {
          socket.send({ type: 'call.reject', data: { call_id: message.data.call.id } })
          return
        }
        dismiss()
        resetCall()
        direction.value = 'incoming'
        call.value = message.data.call
        counterpart.value = message.data.call.caller
        phase.value = 'incoming'
        return

      case 'call.accepted':
        if (!isCurrent(message.data.call.id)) {
          return
        }
        call.value = message.data.call
        if (direction.value === 'outgoing') {
          phase.value = 'connecting'
          createPeerConnection()
          await peer.createOffer()
        }
        return

      case 'signal.offer':
        if (isCurrent(message.data.call_id)) {
          await peer.acceptOffer(message.data.payload as RTCSessionDescriptionInit)
        }
        return

      case 'signal.answer':
        if (isCurrent(message.data.call_id)) {
          await peer.acceptAnswer(message.data.payload as RTCSessionDescriptionInit)
        }
        return

      case 'signal.ice':
        if (isCurrent(message.data.call_id)) {
          await peer.addIceCandidate(message.data.payload as RTCIceCandidateInit)
        }
        return

      case 'call.ended': {
        const ended = message.data.call
        // Если собеседник не в сети или занят, сервер отвечает на call.invite сразу call.ended
        const isInviteReply =
          phase.value === 'outgoing' && call.value === null && ended.caller.id === auth.user?.id

        if ((isCurrent(ended.id) || isInviteReply) && isBusy.value) {
          if (phase.value === 'incoming' && message.data.reason === 'missed' && !hungUpLocally) {
            rememberMissed(ended.id)
          }
          call.value = ended
          finish(endReasonText(message.data.reason, ended))
        }
        return
      }

      case 'error':
        if (phase.value === 'outgoing' && message.data.request === 'call.invite') {
          fail(message.data.message)
        } else if (message.data.request === 'call.resume' && socketLost.value) {
          // Пока нас не было, сервер уже завершил звонок
          finish('Звонок завершён')
        } else {
          error.value = message.data.message
        }
        return
    }
  }

  async function prepareMedia(media: CallMediaOptions): Promise<void> {
    const devices = { audioDeviceId: settings.audioInputId, videoDeviceId: settings.videoInputId }

    try {
      await peer.openMedia({ video: media.video, ...devices })
    } catch (reason) {
      // Сохранённое устройство отключили: пробуем то, что браузер выберет сам
      const hasSaved = devices.audioDeviceId !== null || devices.videoDeviceId !== null
      if (!(reason instanceof MediaAccessError) || reason.reason !== 'not-found' || !hasSaved) {
        throw reason
      }
      settings.audioInputId = null
      settings.videoInputId = null
      await peer.openMedia({ video: media.video })
    }

    // Временные пароли TURN живут ограниченное время — берём свежие на каждый звонок
    iceServers = await callsApi
      .iceServers()
      .then(({ ice_servers }) => ice_servers)
      .catch(() => iceServers)
  }

  function createPeerConnection(): void {
    peer.createConnection({ iceServers, onSignal: sendSignal, onMessage: receivePeerMessage })
  }

  function receivePeerMessage(message: PeerMessage): void {
    if (message.type !== 'chat' || typeof message.text !== 'string') {
      return
    }

    chatMessages.value = [
      ...chatMessages.value,
      {
        id: message.id,
        mine: false,
        text: message.text.slice(0, MAX_CHAT_MESSAGE_LENGTH),
        sentAt: message.sent_at,
      },
    ]
    if (!chatOpen.value) {
      unreadChat.value += 1
    }
  }

  function sendSignal(type: SignalType, payload: SignalPayload): void {
    if (call.value !== null) {
      socket.send({ type, data: { call_id: call.value.id, payload } })
    }
  }

  /** Новый путь до собеседника ищет звонящий: он же создавал первое предложение соединения */
  function restartIce(): void {
    if (direction.value === 'outgoing' && !socketLost.value) {
      void peer.restartIce().catch(() => undefined)
    }
  }

  function waitForReconnect(): void {
    if (reconnectTimer !== null) {
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (socketLost.value) {
        finish('Соединение с сервером звонков потеряно')
      } else {
        connectionFailed()
      }
    }, RECONNECT_GRACE_MS)
  }

  function settleReconnect(): void {
    if (!socketLost.value && !mediaLost.value && reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function endByMe(type: 'call.reject' | 'call.hangup', callId: number): void {
    hungUpLocally = true
    if (!socket.send({ type, data: { call_id: callId } })) {
      finish('Звонок завершён')
    }
  }

  function connectionFailed(): void {
    if (call.value !== null) {
      socket.send({ type: 'call.hangup', data: { call_id: call.value.id } })
    }
    finish('Не удалось соединиться с собеседником. Возможно, мешает сеть — попробуйте позже.')
  }

  function rememberMissed(callId: number): void {
    if (!missedCallIds.value.includes(callId)) {
      missedCallIds.value = [...missedCallIds.value, callId]
    }
  }

  function endReasonText(reason: CallEndReason, endedCall: Call): string {
    const iAmCaller = endedCall.caller.id === auth.user?.id

    if (hungUpLocally) {
      if (endedCall.answered_at !== null) {
        return 'Звонок завершён'
      }
      return iAmCaller ? 'Вызов отменён' : 'Вызов отклонён'
    }

    switch (reason) {
      case 'rejected':
        return 'Собеседник отклонил звонок'
      case 'missed':
        return iAmCaller ? 'Собеседник не ответил' : 'Пропущенный звонок'
      case 'busy':
        return 'Собеседник сейчас разговаривает'
      case 'unavailable':
        return 'Собеседник не в сети'
      case 'answered_elsewhere':
        return 'Звонок принят на другом устройстве'
      case 'ended':
        return 'Собеседник завершил звонок'
    }
  }

  function finish(message: string): void {
    peer.close()
    clearReconnect()
    activeSince.value = null
    endMessage.value = message
    phase.value = 'ended'
    historyVersion.value += 1

    if (dismissTimer !== null) {
      clearTimeout(dismissTimer)
    }
    dismissTimer = setTimeout(dismiss, ENDED_SCREEN_MS)
  }

  function fail(reason: unknown): void {
    peer.close()
    resetCall()
    phase.value = 'idle'
    if (typeof reason === 'string') {
      error.value = reason
    } else if (reason instanceof MediaAccessError) {
      error.value = reason.message
    } else {
      error.value = 'Не удалось начать звонок.'
    }
  }

  function clearReconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    socketLost.value = false
    mediaLost.value = false
  }

  function resetCall(): void {
    clearReconnect()
    call.value = null
    counterpart.value = null
    endMessage.value = ''
    activeSince.value = null
    hungUpLocally = false
    chatMessages.value = []
    chatOpen.value = false
    unreadChat.value = 0
  }

  function isCurrent(callId: number): boolean {
    return call.value !== null && call.value.id === callId
  }

  return {
    phase,
    call,
    counterpart,
    direction,
    endMessage,
    error,
    socketStatus,
    isBusy,
    isOnline,
    activeSince,
    historyVersion,
    missedCount,
    reconnecting,
    chatMessages,
    chatOpen,
    unreadChat,
    localStream: peer.localStream,
    remoteStream: peer.remoteStream,
    micEnabled: peer.micEnabled,
    cameraEnabled: peer.cameraEnabled,
    hasVideo: peer.hasVideo,
    screenSharing: peer.screenSharing,
    remoteMedia: peer.remoteMedia,
    remoteVideoLive: peer.remoteVideoLive,
    stats: peer.stats,
    connect,
    disconnect,
    startCall,
    accept,
    reject,
    hangup,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    selectDevice,
    sendChat,
    setChatOpen,
    onServerMessage,
    notifyTyping,
    isUserOnline,
    clearMissed,
    dismiss,
    clearError,
  }
})
