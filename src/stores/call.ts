import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { callsApi } from '@/api/calls'
import { MediaAccessError, usePeerConnection } from '@/composables/usePeerConnection'
import { defaultSignalingUrl, SignalingSocket, type SocketStatus } from '@/realtime/socket'
import { useAuthStore } from '@/stores/auth'
import type { Call, User } from '@/types/api'
import type { CallEndReason, ServerMessage, SignalPayload, SignalType } from '@/types/call'

/**
 * idle → outgoing (звоним, ждём ответа) | incoming (звонят нам)
 *      → connecting (ответили, браузеры устанавливают прямое соединение)
 *      → active (разговор) → ended (итог показывается несколько секунд) → idle
 */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended'

const ENDED_SCREEN_MS = 4000

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export const useCallStore = defineStore('call', () => {
  const auth = useAuthStore()
  const socket = new SignalingSocket(defaultSignalingUrl())
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

  const isBusy = computed(() => phase.value !== 'idle' && phase.value !== 'ended')
  const isOnline = computed(() => socketStatus.value === 'open')

  let iceServers: RTCIceServer[] | null = null
  let dismissTimer: ReturnType<typeof setTimeout> | null = null
  let hungUpLocally = false

  socket.onStatus((status) => {
    socketStatus.value = status
    if ((status === 'closed' || status === 'unauthorized') && isBusy.value) {
      finish('Соединение с сервером звонков потеряно')
    }
  })

  socket.onMessage((message) => {
    void handle(message).catch(() => connectionFailed())
  })

  watch(peer.connectionState, (state) => {
    if (state === 'connected' && phase.value === 'connecting') {
      phase.value = 'active'
      activeSince.value = Date.now()
    } else if (state === 'failed' && isBusy.value) {
      connectionFailed()
    }
  })

  function connect(token: string): void {
    socket.connect(token)
  }

  function disconnect(): void {
    if (isBusy.value) {
      hangup()
    }
    socket.disconnect()
  }

  async function startCall(user: User): Promise<void> {
    if (isBusy.value) {
      return
    }

    resetCall()
    direction.value = 'outgoing'
    counterpart.value = user
    phase.value = 'outgoing'

    try {
      await prepareMedia()
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

  async function accept(): Promise<void> {
    const incoming = call.value
    if (phase.value !== 'incoming' || incoming === null) {
      return
    }

    phase.value = 'connecting'

    try {
      await prepareMedia()
    } catch (reason) {
      socket.send({ type: 'call.reject', data: { call_id: incoming.id } })
      fail(reason)
      return
    }

    if (call.value?.id !== incoming.id || phase.value !== 'connecting') {
      return
    }

    peer.createConnection({ iceServers: iceServers ?? FALLBACK_ICE_SERVERS, onSignal: sendSignal })
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

  function toggleCamera(): void {
    peer.setCameraEnabled(!peer.cameraEnabled.value)
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
          peer.createConnection({
            iceServers: iceServers ?? FALLBACK_ICE_SERVERS,
            onSignal: sendSignal,
          })
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
          call.value = ended
          finish(endReasonText(message.data.reason, ended))
        }
        return
      }

      case 'error':
        if (phase.value === 'outgoing' && message.data.request === 'call.invite') {
          fail(message.data.message)
        } else {
          error.value = message.data.message
        }
        return
    }
  }

  async function prepareMedia(): Promise<void> {
    await peer.openMedia()

    if (iceServers === null) {
      iceServers = await callsApi
        .iceServers()
        .then(({ ice_servers }) => ice_servers)
        .catch(() => FALLBACK_ICE_SERVERS)
    }
  }

  function sendSignal(type: SignalType, payload: SignalPayload): void {
    if (call.value !== null) {
      socket.send({ type, data: { call_id: call.value.id, payload } })
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

  function resetCall(): void {
    call.value = null
    counterpart.value = null
    endMessage.value = ''
    activeSince.value = null
    hungUpLocally = false
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
    localStream: peer.localStream,
    remoteStream: peer.remoteStream,
    micEnabled: peer.micEnabled,
    cameraEnabled: peer.cameraEnabled,
    hasVideo: peer.hasVideo,
    connect,
    disconnect,
    startCall,
    accept,
    reject,
    hangup,
    toggleMic,
    toggleCamera,
    dismiss,
    clearError,
  }
})
