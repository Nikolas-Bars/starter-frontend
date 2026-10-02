import { readonly, ref, shallowRef } from 'vue'

import type { SignalPayload, SignalType } from '@/types/call'

export class MediaAccessError extends Error {
  constructor() {
    super('Нет доступа к камере и микрофону. Разрешите их в настройках браузера.')
    this.name = 'MediaAccessError'
  }
}

export interface PeerConnectionOptions {
  iceServers: RTCIceServer[]
  /** Отправить собеседнику через сервер сигнализации */
  onSignal: (type: SignalType, payload: SignalPayload) => void
}

/**
 * Прямое соединение с собеседником (WebRTC): своё видео и звук, чужой поток, состояние связи.
 *
 * Порядок: openMedia() → createConnection() → звонящий createOffer(), собеседник acceptOffer();
 * ICE-кандидаты обе стороны передают друг другу через addIceCandidate().
 */
export function usePeerConnection() {
  const localStream = shallowRef<MediaStream | null>(null)
  const remoteStream = shallowRef<MediaStream | null>(null)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const micEnabled = ref(true)
  const cameraEnabled = ref(false)
  const hasVideo = ref(false)

  let connection: RTCPeerConnection | null = null
  let onSignal: PeerConnectionOptions['onSignal'] = () => undefined
  // Кандидаты собеседника, пришедшие раньше его SDP-описания: применяем, когда оно появится
  let pendingCandidates: RTCIceCandidateInit[] = []

  /** Камера и микрофон; без камеры (нет её или запрещена) звонок идёт только со звуком. */
  async function openMedia(): Promise<MediaStream> {
    if (localStream.value !== null) {
      return localStream.value
    }

    const devices = navigator.mediaDevices
    if (!devices?.getUserMedia) {
      throw new MediaAccessError()
    }

    let stream: MediaStream
    try {
      stream = await devices.getUserMedia({ video: true, audio: true })
    } catch {
      try {
        stream = await devices.getUserMedia({ audio: true })
      } catch {
        throw new MediaAccessError()
      }
    }

    localStream.value = stream
    hasVideo.value = stream.getVideoTracks().length > 0
    cameraEnabled.value = hasVideo.value
    micEnabled.value = true

    return stream
  }

  function createConnection(options: PeerConnectionOptions): void {
    closeConnection()

    onSignal = options.onSignal
    connection = new RTCPeerConnection({ iceServers: options.iceServers })
    connectionState.value = connection.connectionState

    const stream = localStream.value
    stream?.getTracks().forEach((track) => connection?.addTrack(track, stream))

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        onSignal('signal.ice', event.candidate.toJSON())
      }
    }

    connection.ontrack = (event) => {
      remoteStream.value = event.streams[0] ?? new MediaStream([event.track])
    }

    connection.onconnectionstatechange = () => {
      if (connection) {
        connectionState.value = connection.connectionState
      }
    }
  }

  async function createOffer(): Promise<void> {
    const peer = requireConnection()
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    onSignal('signal.offer', { type: offer.type, sdp: offer.sdp })
  }

  async function acceptOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    const peer = requireConnection()
    await peer.setRemoteDescription(offer)
    await flushPendingCandidates(peer)

    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)
    onSignal('signal.answer', { type: answer.type, sdp: answer.sdp })
  }

  async function acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = requireConnection()
    await peer.setRemoteDescription(answer)
    await flushPendingCandidates(peer)
  }

  async function addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (connection === null || connection.remoteDescription === null) {
      pendingCandidates.push(candidate)
      return
    }

    await connection.addIceCandidate(candidate)
  }

  function setMicEnabled(enabled: boolean): void {
    localStream.value?.getAudioTracks().forEach((track) => (track.enabled = enabled))
    micEnabled.value = enabled
  }

  function setCameraEnabled(enabled: boolean): void {
    if (!hasVideo.value) {
      return
    }
    localStream.value?.getVideoTracks().forEach((track) => (track.enabled = enabled))
    cameraEnabled.value = enabled
  }

  /** Закрывает соединение и выключает камеру с микрофоном. */
  function close(): void {
    closeConnection()
    localStream.value?.getTracks().forEach((track) => track.stop())
    localStream.value = null
    hasVideo.value = false
    cameraEnabled.value = false
    micEnabled.value = true
  }

  function closeConnection(): void {
    if (connection !== null) {
      connection.onicecandidate = null
      connection.ontrack = null
      connection.onconnectionstatechange = null
      connection.close()
      connection = null
    }
    pendingCandidates = []
    remoteStream.value = null
    connectionState.value = 'new'
  }

  async function flushPendingCandidates(peer: RTCPeerConnection): Promise<void> {
    const candidates = pendingCandidates
    pendingCandidates = []
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate)
    }
  }

  function requireConnection(): RTCPeerConnection {
    if (connection === null) {
      throw new Error('RTCPeerConnection ещё не создан: вызовите createConnection()')
    }
    return connection
  }

  return {
    localStream,
    remoteStream,
    connectionState: readonly(connectionState),
    micEnabled: readonly(micEnabled),
    cameraEnabled: readonly(cameraEnabled),
    hasVideo: readonly(hasVideo),
    openMedia,
    createConnection,
    createOffer,
    acceptOffer,
    acceptAnswer,
    addIceCandidate,
    setMicEnabled,
    setCameraEnabled,
    close,
  }
}

export type PeerConnection = ReturnType<typeof usePeerConnection>
