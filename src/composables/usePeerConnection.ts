import { readonly, ref, shallowRef } from 'vue'

import type { MediaState, PeerMessage, SignalPayload, SignalType } from '@/types/call'

export type MediaAccessReason = 'denied' | 'not-found' | 'busy' | 'unsupported' | 'unknown'

const MEDIA_ACCESS_MESSAGES: Record<MediaAccessReason, string> = {
  denied:
    'Доступ к камере и микрофону запрещён. Разрешите его для сайта в браузере. На iPhone и iPad ' +
    'проверьте ещё «Настройки» → ваш браузер → «Камера» и «Микрофон».',
  'not-found': 'Не нашли камеру и микрофон. Проверьте, что они подключены.',
  busy: 'Камера или микрофон заняты другим приложением. Закройте его и попробуйте снова.',
  unsupported: 'Этот браузер не умеет звонить. Обновите его или откройте сайт в Chrome или Safari.',
  unknown: 'Не удалось включить камеру и микрофон. Попробуйте ещё раз или перезапустите браузер.',
}

export class MediaAccessError extends Error {
  constructor(readonly reason: MediaAccessReason = 'unknown') {
    super(MEDIA_ACCESS_MESSAGES[reason])
    this.name = 'MediaAccessError'
  }
}

function mediaAccessReason(error: unknown): MediaAccessReason {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    case 'NotReadableError':
    case 'AbortError':
      return 'busy'
    default:
      return 'unknown'
  }
}

export type ConnectionQuality = 'good' | 'fair' | 'poor'

export interface ConnectionStats {
  quality: ConnectionQuality
  /** Время до собеседника и обратно, мс */
  roundTripMs: number | null
  /** Доля потерянных пакетов за последний замер, % */
  packetLossPercent: number
  /** Связь идёт через TURN-сервер, а не напрямую */
  relayed: boolean
}

export interface OpenMediaOptions {
  video?: boolean
  audioDeviceId?: string | null
  videoDeviceId?: string | null
}

export interface PeerConnectionOptions {
  iceServers: RTCIceServer[]
  /** Отправить собеседнику через сервер сигнализации */
  onSignal: (type: SignalType, payload: SignalPayload) => void
  /** Сообщение собеседника по прямому каналу данных (кроме состояния камеры и микрофона) */
  onMessage?: (message: PeerMessage) => void
}

const DATA_CHANNEL_LABEL = 'app'

const STATS_INTERVAL_MS = 2000

/**
 * Прямое соединение с собеседником (WebRTC): своё видео и звук, чужой поток, состояние связи.
 *
 * Порядок: openMedia() → createConnection() → звонящий createOffer(), собеседник acceptOffer();
 * ICE-кандидаты обе стороны передают друг другу через addIceCandidate().
 *
 * В соединении всегда есть аудио- и видеоканал, даже если камеры нет: камеру, другое устройство
 * или демонстрацию экрана можно включить посреди разговора без повторного согласования.
 * Состояние камеры, микрофона и экрана стороны сообщают друг другу по каналу данных.
 */
export function usePeerConnection() {
  const localStream = shallowRef<MediaStream | null>(null)
  const remoteStream = shallowRef<MediaStream | null>(null)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const micEnabled = ref(true)
  const cameraEnabled = ref(false)
  const hasVideo = ref(false)
  const screenSharing = ref(false)
  /** Что включено у собеседника; null — он ещё не сообщил */
  const remoteMedia = ref<MediaState | null>(null)
  /** По видеоканалу собеседника идут кадры */
  const remoteVideoLive = ref(false)
  const stats = ref<ConnectionStats | null>(null)

  let connection: RTCPeerConnection | null = null
  let channel: RTCDataChannel | null = null
  let screenTrack: MediaStreamTrack | null = null
  let statsTimer: ReturnType<typeof setInterval> | null = null
  let lastPackets: { received: number; lost: number } | null = null
  let options: PeerConnectionOptions = { iceServers: [], onSignal: () => undefined }
  // Кандидаты собеседника, пришедшие раньше его SDP-описания: применяем, когда оно появится
  let pendingCandidates: RTCIceCandidateInit[] = []

  /** Камера и микрофон; без камеры (нет её или запрещена) звонок идёт только со звуком. */
  async function openMedia(media: OpenMediaOptions = {}): Promise<MediaStream> {
    if (localStream.value !== null) {
      return localStream.value
    }

    const devices = navigator.mediaDevices
    if (!devices?.getUserMedia) {
      throw new MediaAccessError('unsupported')
    }

    const audio = deviceConstraint(media.audioDeviceId)
    let stream: MediaStream

    if (media.video === false) {
      stream = await getMedia({ audio })
    } else {
      try {
        stream = await devices.getUserMedia({ audio, video: deviceConstraint(media.videoDeviceId) })
      } catch (videoError) {
        const reason = mediaAccessReason(videoError)
        // Без разрешения на камеру не будет и разрешения на микрофон — второй запрос бессмыслен
        if (reason === 'denied') {
          throw new MediaAccessError(reason)
        }
        stream = await getMedia({ audio })
      }
    }

    localStream.value = stream
    hasVideo.value = stream.getVideoTracks().length > 0
    cameraEnabled.value = hasVideo.value
    micEnabled.value = true

    return stream
  }

  function createConnection(connectionOptions: PeerConnectionOptions): void {
    closeConnection()

    options = connectionOptions
    connection = new RTCPeerConnection({ iceServers: options.iceServers })
    connectionState.value = connection.connectionState

    const stream = localStream.value
    stream?.getTracks().forEach((track) => connection?.addTrack(track, stream))

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        options.onSignal('signal.ice', event.candidate.toJSON())
      }
    }

    connection.ontrack = (event) => addRemoteTrack(event.track)

    connection.ondatachannel = (event) => bindChannel(event.channel)

    connection.onconnectionstatechange = () => {
      if (connection) {
        connectionState.value = connection.connectionState
        if (connection.connectionState === 'connected') {
          startStats()
        }
      }
    }
  }

  async function createOffer(offerOptions: { iceRestart?: boolean } = {}): Promise<void> {
    const peer = requireConnection()

    if (channel === null) {
      if (!peer.getTransceivers().some((transceiver) => transceiverKind(transceiver) === 'video')) {
        peer.addTransceiver('video', { direction: 'sendrecv' })
      }
      bindChannel(peer.createDataChannel(DATA_CHANNEL_LABEL))
    }

    const offer = await peer.createOffer(offerOptions)
    await peer.setLocalDescription(offer)
    options.onSignal('signal.offer', { type: offer.type, sdp: offer.sdp })
  }

  /** Перезапуск ICE после обрыва сети: заново ищем путь до собеседника, не прерывая звонок. */
  async function restartIce(): Promise<void> {
    if (connection !== null) {
      await createOffer({ iceRestart: true })
    }
  }

  async function acceptOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    const peer = requireConnection()
    await peer.setRemoteDescription(offer)

    // Каналы из предложения собеседника создаются «только приём»: отвечаем, что тоже будем слать
    peer.getTransceivers().forEach((transceiver) => {
      if (transceiver.direction === 'recvonly') {
        transceiver.direction = 'sendrecv'
      }
    })

    await flushPendingCandidates(peer)

    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)
    options.onSignal('signal.answer', { type: answer.type, sdp: answer.sdp })
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
    sendMediaState()
  }

  /** Без камеры в звонке она запрашивается при первом включении. */
  async function setCameraEnabled(enabled: boolean): Promise<void> {
    if (enabled && !hasVideo.value) {
      await addCamera(null)
      return
    }

    localStream.value?.getVideoTracks().forEach((track) => (track.enabled = enabled))
    cameraEnabled.value = enabled && hasVideo.value
    sendMediaState()
  }

  /** Переключает микрофон или камеру на другое устройство прямо во время звонка. */
  async function switchDevice(kind: 'audio' | 'video', deviceId: string): Promise<void> {
    const stream = localStream.value
    if (stream === null) {
      return
    }

    if (kind === 'video' && !hasVideo.value) {
      await addCamera(deviceId)
      return
    }

    const constraints = deviceConstraint(deviceId)
    const fresh = await getMedia(kind === 'audio' ? { audio: constraints } : { video: constraints })
    const track = fresh.getTracks()[0]
    if (track === undefined) {
      return
    }

    const previous = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
    track.enabled = kind === 'audio' ? micEnabled.value : cameraEnabled.value

    previous.forEach((old) => {
      stream.removeTrack(old)
      old.stop()
    })
    stream.addTrack(track)
    refreshLocalStream(stream)

    if (kind === 'audio' || !screenSharing.value) {
      await senderFor(kind)?.replaceTrack(track)
    }
  }

  /** Показывает собеседнику экран вместо камеры. Браузер сам спросит, что именно показать. */
  async function startScreenShare(): Promise<void> {
    if (screenSharing.value) {
      return
    }

    const devices = navigator.mediaDevices
    if (!devices?.getDisplayMedia) {
      throw new MediaAccessError('unsupported')
    }

    const display = await devices.getDisplayMedia({ video: true, audio: false })
    const track = display.getVideoTracks()[0]
    if (track === undefined) {
      return
    }

    screenTrack = track
    track.onended = () => void stopScreenShare()
    await senderFor('video')?.replaceTrack(track)
    screenSharing.value = true
    sendMediaState()
  }

  async function stopScreenShare(): Promise<void> {
    if (screenTrack === null) {
      return
    }

    screenTrack.onended = null
    screenTrack.stop()
    screenTrack = null
    screenSharing.value = false

    await senderFor('video')?.replaceTrack(localStream.value?.getVideoTracks()[0] ?? null)
    sendMediaState()
  }

  /** @returns false, если канал с собеседником ещё не открыт */
  function sendMessage(message: PeerMessage): boolean {
    if (channel === null || channel.readyState !== 'open') {
      return false
    }

    channel.send(JSON.stringify(message))
    return true
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

  async function getMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      throw new MediaAccessError(mediaAccessReason(error))
    }
  }

  async function addCamera(deviceId: string | null): Promise<void> {
    const stream = localStream.value
    if (stream === null) {
      return
    }

    const camera = await getMedia({ video: deviceConstraint(deviceId) })
    const track = camera.getVideoTracks()[0]
    if (track === undefined) {
      return
    }

    stream.addTrack(track)
    refreshLocalStream(stream)
    hasVideo.value = true
    cameraEnabled.value = true

    if (!screenSharing.value) {
      await senderFor('video')?.replaceTrack(track)
    }
    sendMediaState()
  }

  /** Новый объект потока, чтобы видео-элемент и computed заметили смену дорожек. */
  function refreshLocalStream(stream: MediaStream): void {
    localStream.value = new MediaStream(stream.getTracks())
  }

  function senderFor(kind: 'audio' | 'video'): RTCRtpSender | null {
    const transceiver = connection
      ?.getTransceivers()
      .find((candidate) => transceiverKind(candidate) === kind)
    return transceiver?.sender ?? null
  }

  function addRemoteTrack(track: MediaStreamTrack): void {
    const tracks = (remoteStream.value?.getTracks() ?? []).filter(
      (existing) => existing.kind !== track.kind,
    )
    remoteStream.value = new MediaStream([...tracks, track])

    if (track.kind === 'video') {
      remoteVideoLive.value = !track.muted
      track.onmute = () => (remoteVideoLive.value = false)
      track.onunmute = () => (remoteVideoLive.value = true)
    }
  }

  function bindChannel(dataChannel: RTCDataChannel): void {
    if (dataChannel.label !== DATA_CHANNEL_LABEL) {
      return
    }

    channel = dataChannel
    dataChannel.onopen = () => sendMediaState()
    dataChannel.onmessage = (event: MessageEvent) => {
      const message = parsePeerMessage(event.data)
      if (message === null) {
        return
      }
      if (message.type === 'media') {
        remoteMedia.value = { mic: message.mic, camera: message.camera, screen: message.screen }
      } else {
        options.onMessage?.(message)
      }
    }
  }

  function sendMediaState(): void {
    sendMessage({
      type: 'media',
      mic: micEnabled.value,
      camera: cameraEnabled.value,
      screen: screenSharing.value,
    })
  }

  function startStats(): void {
    if (statsTimer !== null) {
      return
    }
    statsTimer = setInterval(() => void collectStats(), STATS_INTERVAL_MS)
  }

  async function collectStats(): Promise<void> {
    if (connection === null) {
      return
    }

    const report = await connection.getStats()
    let roundTripMs: number | null = null
    let relayed = false
    let received = 0
    let lost = 0
    const candidates = new Map<string, RTCStats & { candidateType?: string }>()

    report.forEach((entry: RTCStats & Record<string, unknown>) => {
      if (entry.type === 'local-candidate' || entry.type === 'remote-candidate') {
        candidates.set(entry.id, entry)
      }
    })

    report.forEach((entry: RTCStats & Record<string, unknown>) => {
      if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.nominated) {
        if (typeof entry.currentRoundTripTime === 'number') {
          roundTripMs = Math.round(entry.currentRoundTripTime * 1000)
        }
        relayed = [entry.localCandidateId, entry.remoteCandidateId].some(
          (id) => typeof id === 'string' && candidates.get(id)?.candidateType === 'relay',
        )
      }
      if (entry.type === 'inbound-rtp') {
        received += typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0
        lost += typeof entry.packetsLost === 'number' ? entry.packetsLost : 0
      }
    })

    const deltaReceived = received - (lastPackets?.received ?? 0)
    const deltaLost = lost - (lastPackets?.lost ?? 0)
    lastPackets = { received, lost }

    const total = deltaReceived + deltaLost
    const packetLossPercent = total > 0 ? Math.max(0, (deltaLost / total) * 100) : 0

    stats.value = {
      quality: rateQuality(roundTripMs, packetLossPercent),
      roundTripMs,
      packetLossPercent: Math.round(packetLossPercent * 10) / 10,
      relayed,
    }
  }

  function closeConnection(): void {
    if (statsTimer !== null) {
      clearInterval(statsTimer)
      statsTimer = null
    }
    if (screenTrack !== null) {
      screenTrack.onended = null
      screenTrack.stop()
      screenTrack = null
    }
    if (channel !== null) {
      channel.onopen = null
      channel.onmessage = null
      channel.close()
      channel = null
    }
    if (connection !== null) {
      connection.onicecandidate = null
      connection.ontrack = null
      connection.ondatachannel = null
      connection.onconnectionstatechange = null
      connection.close()
      connection = null
    }
    pendingCandidates = []
    lastPackets = null
    remoteStream.value = null
    remoteMedia.value = null
    remoteVideoLive.value = false
    screenSharing.value = false
    stats.value = null
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
    screenSharing: readonly(screenSharing),
    remoteMedia: readonly(remoteMedia),
    remoteVideoLive: readonly(remoteVideoLive),
    stats: readonly(stats),
    openMedia,
    createConnection,
    createOffer,
    restartIce,
    acceptOffer,
    acceptAnswer,
    addIceCandidate,
    setMicEnabled,
    setCameraEnabled,
    switchDevice,
    startScreenShare,
    stopScreenShare,
    sendMessage,
    close,
  }
}

export type PeerConnection = ReturnType<typeof usePeerConnection>

/** Пороговые значения — примерно как у индикаторов связи в мессенджерах */
export function rateQuality(
  roundTripMs: number | null,
  packetLossPercent: number,
): ConnectionQuality {
  if (packetLossPercent > 8 || (roundTripMs ?? 0) > 600) {
    return 'poor'
  }
  if (packetLossPercent > 2 || (roundTripMs ?? 0) > 300) {
    return 'fair'
  }
  return 'good'
}

function deviceConstraint(deviceId: string | null | undefined): MediaTrackConstraints | boolean {
  return deviceId ? { deviceId: { exact: deviceId } } : true
}

function transceiverKind(transceiver: RTCRtpTransceiver): string {
  return transceiver.receiver.track.kind
}

function parsePeerMessage(data: unknown): PeerMessage | null {
  if (typeof data !== 'string') {
    return null
  }
  try {
    const message: unknown = JSON.parse(data)
    return typeof message === 'object' && message !== null && 'type' in message
      ? (message as PeerMessage)
      : null
  } catch {
    return null
  }
}
