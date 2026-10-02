import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, type Ref } from 'vue'

import {
  MediaAccessError,
  type OpenMediaOptions,
  type PeerConnectionOptions,
} from '@/composables/usePeerConnection'
import type { SocketStatus } from '@/realtime/socket'
import { useAuthStore } from '@/stores/auth'
import { RECONNECT_GRACE_MS, useCallStore } from '@/stores/call'
import type { Call, IceServer, Paginated, User } from '@/types/api'
import type { ClientMessage, PeerMessage, ServerMessage } from '@/types/call'

interface FakeSocket {
  status: SocketStatus
  sent: ClientMessage[]
  connect: Mock<(token: string) => void>
  emit(message: ServerMessage): void
  setStatus(status: SocketStatus): void
}

interface FakePeer {
  connectionState: Ref<RTCPeerConnectionState>
  openMedia: Mock<(options?: OpenMediaOptions) => Promise<void>>
  restartIce: Mock<() => Promise<void>>
  sendMessage: Mock<(message: PeerMessage) => boolean>
  createConnection: Mock<(options: PeerConnectionOptions) => void>
  createOffer: Mock<() => Promise<void>>
  acceptOffer: Mock<(description: RTCSessionDescriptionInit) => Promise<void>>
  acceptAnswer: Mock<(description: RTCSessionDescriptionInit) => Promise<void>>
  addIceCandidate: Mock<(candidate: RTCIceCandidateInit) => Promise<void>>
  close: Mock<() => void>
}

const fakes = vi.hoisted(() => ({
  socket: undefined as FakeSocket | undefined,
  peer: undefined as FakePeer | undefined,
}))

vi.mock('@/realtime/socket', () => {
  class FakeSignalingSocket implements FakeSocket {
    status: SocketStatus = 'idle'
    sent: ClientMessage[] = []
    connect = vi.fn<(token: string) => void>()
    disconnect = vi.fn<() => void>()
    private messageListener: ((message: ServerMessage) => void) | null = null
    private statusListener: ((status: SocketStatus) => void) | null = null

    constructor() {
      fakes.socket = this
    }

    send(message: ClientMessage): boolean {
      if (this.status !== 'open') {
        return false
      }
      this.sent.push(message)
      return true
    }

    onMessage(listener: (message: ServerMessage) => void): () => void {
      this.messageListener = listener
      return () => undefined
    }

    onStatus(listener: (status: SocketStatus) => void): () => void {
      this.statusListener = listener
      return () => undefined
    }

    emit(message: ServerMessage): void {
      this.messageListener?.(message)
    }

    setStatus(status: SocketStatus): void {
      this.status = status
      this.statusListener?.(status)
    }
  }

  return { SignalingSocket: FakeSignalingSocket, defaultSignalingUrl: () => 'ws://test' }
})

vi.mock('@/composables/usePeerConnection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/usePeerConnection')>()
  const { ref, shallowRef } = await import('vue')

  return {
    ...actual,
    usePeerConnection: () => {
      const micEnabled = ref(true)
      const cameraEnabled = ref(true)
      const peer = {
        localStream: shallowRef(null),
        remoteStream: shallowRef(null),
        connectionState: ref<RTCPeerConnectionState>('new'),
        micEnabled,
        cameraEnabled,
        hasVideo: ref(true),
        screenSharing: ref(false),
        remoteMedia: ref(null),
        remoteVideoLive: ref(false),
        stats: ref(null),
        openMedia: vi.fn<(options?: OpenMediaOptions) => Promise<void>>(async () => undefined),
        createConnection: vi.fn<(options: PeerConnectionOptions) => void>(),
        createOffer: vi.fn<() => Promise<void>>(async () => undefined),
        restartIce: vi.fn<() => Promise<void>>(async () => undefined),
        switchDevice: vi.fn<(kind: 'audio' | 'video', deviceId: string) => Promise<void>>(
          async () => undefined,
        ),
        startScreenShare: vi.fn<() => Promise<void>>(async () => undefined),
        stopScreenShare: vi.fn<() => Promise<void>>(async () => undefined),
        sendMessage: vi.fn<(message: PeerMessage) => boolean>(() => true),
        acceptOffer: vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>(
          async () => undefined,
        ),
        acceptAnswer: vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>(
          async () => undefined,
        ),
        addIceCandidate: vi.fn<(candidate: RTCIceCandidateInit) => Promise<void>>(
          async () => undefined,
        ),
        setMicEnabled: vi.fn<(enabled: boolean) => boolean>(
          (enabled) => (micEnabled.value = enabled),
        ),
        setCameraEnabled: vi.fn<(enabled: boolean) => Promise<void>>(async (enabled) => {
          cameraEnabled.value = enabled
        }),
        close: vi.fn<() => void>(),
      }
      fakes.peer = peer
      return peer
    },
  }
})

vi.mock('@/api/calls', () => ({
  callsApi: {
    iceServers: vi.fn<() => Promise<{ ice_servers: IceServer[] }>>(async () => ({
      ice_servers: [{ urls: ['stun:stun.test:3478'] }],
    })),
    history: vi.fn<() => Promise<Paginated<Call>>>(),
    webSocketTicket: vi.fn<() => Promise<{ ticket: string; expires_in: number }>>(),
  },
}))

const me: User = {
  id: 1,
  name: 'Иван',
  email: 'ivan@example.com',
  email_verified_at: null,
  created_at: null,
}
const bob: User = { ...me, id: 2, name: 'Мария', email: 'maria@example.com' }

function makeCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 10,
    status: 'ringing',
    caller: me,
    callee: bob,
    started_at: '2026-10-01T10:00:00Z',
    answered_at: null,
    ended_at: null,
    duration_seconds: null,
    ...overrides,
  }
}

function socket(): FakeSocket {
  if (!fakes.socket) throw new Error('Сокет не создан')
  return fakes.socket
}

function lastSent(): ClientMessage | undefined {
  const { sent } = socket()
  return sent[sent.length - 1]
}

function peer(): FakePeer {
  if (!fakes.peer) throw new Error('Peer не создан')
  return fakes.peer
}

describe('call store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    localStorage.clear()
    setActivePinia(createPinia())
    useAuthStore().user = me
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function openStore() {
    const store = useCallStore()
    socket().setStatus('open')
    socket().emit({ type: 'ready', data: { user_id: me.id } })
    return store
  }

  it('проводит исходящий звонок от вызова до завершения', async () => {
    const store = openStore()

    await store.startCall(bob)

    expect(store.phase).toBe('outgoing')
    expect(peer().openMedia).toHaveBeenCalled()
    expect(socket().sent).toEqual([{ type: 'call.invite', data: { callee_id: bob.id } }])

    socket().emit({ type: 'call.ringing', data: { call: makeCall() } })
    expect(store.call?.id).toBe(10)

    socket().emit({ type: 'call.accepted', data: { call: makeCall({ status: 'active' }) } })
    await flushPromises()

    expect(store.phase).toBe('connecting')
    const options = peer().createConnection.mock.calls[0]?.[0]
    expect(options?.iceServers).toEqual([{ urls: ['stun:stun.test:3478'] }])
    expect(peer().createOffer).toHaveBeenCalled()

    options?.onSignal('signal.offer', { type: 'offer', sdp: 'v=0' })
    expect(lastSent()).toEqual({
      type: 'signal.offer',
      data: { call_id: 10, payload: { type: 'offer', sdp: 'v=0' } },
    })

    socket().emit({
      type: 'signal.answer',
      data: { call_id: 10, payload: { type: 'answer', sdp: 'v=0' } },
    })
    await flushPromises()
    expect(peer().acceptAnswer).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0' })

    peer().connectionState.value = 'connected'
    await nextTick()
    expect(store.phase).toBe('active')
    expect(store.activeSince).not.toBeNull()

    socket().emit({
      type: 'call.ended',
      data: {
        call: makeCall({ status: 'ended', answered_at: '2026-10-01T10:00:05Z' }),
        reason: 'ended',
      },
    })

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Собеседник завершил звонок')
    expect(peer().close).toHaveBeenCalled()
    expect(store.historyVersion).toBe(1)

    vi.advanceTimersByTime(4000)
    expect(store.phase).toBe('idle')
    expect(store.call).toBeNull()
  })

  it('сразу завершает вызов, если собеседник не в сети', async () => {
    const store = openStore()
    await store.startCall(bob)

    socket().emit({
      type: 'call.ended',
      data: { call: makeCall({ status: 'unavailable' }), reason: 'unavailable' },
    })

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Собеседник не в сети')
  })

  it('принимает входящий звонок и обрабатывает сигналы собеседника', async () => {
    const store = openStore()
    const incoming = makeCall({ caller: bob, callee: me })

    socket().emit({ type: 'call.incoming', data: { call: incoming } })

    expect(store.phase).toBe('incoming')
    expect(store.counterpart?.name).toBe('Мария')

    await store.accept()

    expect(peer().openMedia).toHaveBeenCalled()
    expect(peer().createConnection).toHaveBeenCalled()
    expect(socket().sent).toEqual([{ type: 'call.accept', data: { call_id: 10 } }])

    socket().emit({
      type: 'signal.offer',
      data: { call_id: 10, payload: { type: 'offer', sdp: 'v=0' } },
    })
    socket().emit({
      type: 'signal.ice',
      data: { call_id: 10, payload: { candidate: 'candidate:1', sdpMid: '0' } },
    })
    socket().emit({
      type: 'signal.ice',
      data: { call_id: 99, payload: { candidate: 'candidate:2', sdpMid: '0' } },
    })
    await flushPromises()

    expect(peer().acceptOffer).toHaveBeenCalledWith({ type: 'offer', sdp: 'v=0' })
    expect(peer().addIceCandidate).toHaveBeenCalledTimes(1)
  })

  it('отклоняет входящий звонок', () => {
    const store = openStore()
    socket().emit({ type: 'call.incoming', data: { call: makeCall({ caller: bob, callee: me }) } })

    store.reject()

    expect(socket().sent).toEqual([{ type: 'call.reject', data: { call_id: 10 } }])

    socket().emit({
      type: 'call.ended',
      data: { call: makeCall({ caller: bob, callee: me, status: 'rejected' }), reason: 'rejected' },
    })

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Вызов отклонён')
  })

  it('автоматически отклоняет второй входящий звонок во время разговора', async () => {
    const store = openStore()
    await store.startCall(bob)

    socket().emit({
      type: 'call.incoming',
      data: { call: makeCall({ id: 11, caller: { ...bob, id: 3 }, callee: me }) },
    })

    expect(store.phase).toBe('outgoing')
    expect(lastSent()).toEqual({ type: 'call.reject', data: { call_id: 11 } })
  })

  it('показывает ошибку, если нет доступа к камере и микрофону', async () => {
    const store = openStore()
    peer().openMedia.mockRejectedValueOnce(new MediaAccessError())

    await store.startCall(bob)

    expect(store.phase).toBe('idle')
    expect(store.error).toBe(new MediaAccessError().message)
    expect(socket().sent).toEqual([])
  })

  it('завершает звонок, если пропала связь с сервером', async () => {
    const store = openStore()
    await store.startCall(bob)
    socket().emit({ type: 'call.ringing', data: { call: makeCall() } })

    socket().setStatus('closed')

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Соединение с сервером звонков потеряно')
    expect(peer().close).toHaveBeenCalled()
  })

  it('отменяет вызов до подтверждения сервера и сбрасывает запоздавший call.ringing', async () => {
    const store = openStore()
    await store.startCall(bob)

    store.hangup()

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Вызов отменён')

    socket().emit({ type: 'call.ringing', data: { call: makeCall() } })

    expect(lastSent()).toEqual({ type: 'call.hangup', data: { call_id: 10 } })
  })

  it('показывает итог «Собеседник не ответил» после таймаута', async () => {
    const store = openStore()
    await store.startCall(bob)
    socket().emit({ type: 'call.ringing', data: { call: makeCall() } })

    socket().emit({
      type: 'call.ended',
      data: { call: makeCall({ status: 'missed' }), reason: 'missed' },
    })

    expect(store.endMessage).toBe('Собеседник не ответил')
  })

  async function activeOutgoingCall() {
    const store = openStore()
    await store.startCall(bob)
    socket().emit({ type: 'call.ringing', data: { call: makeCall() } })
    socket().emit({ type: 'call.accepted', data: { call: makeCall({ status: 'active' }) } })
    await flushPromises()
    peer().connectionState.value = 'connected'
    await nextTick()
    return store
  }

  it('не рвёт разговор при обрыве сокета и возобновляет его после переподключения', async () => {
    const store = await activeOutgoingCall()

    socket().setStatus('closed')

    expect(store.phase).toBe('active')
    expect(store.reconnecting).toBe(true)

    socket().setStatus('open')
    socket().emit({ type: 'ready', data: { user_id: me.id } })
    expect(lastSent()).toEqual({ type: 'call.resume', data: { call_id: 10 } })

    socket().emit({ type: 'call.resumed', data: { call: makeCall({ status: 'active' }) } })
    expect(store.reconnecting).toBe(false)

    vi.advanceTimersByTime(RECONNECT_GRACE_MS)
    expect(store.phase).toBe('active')
  })

  it('завершает разговор, если сервер звонков не вернулся вовремя', async () => {
    const store = await activeOutgoingCall()

    socket().setStatus('closed')
    vi.advanceTimersByTime(RECONNECT_GRACE_MS)

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Соединение с сервером звонков потеряно')
  })

  it('завершает звонок, если сервер уже закрыл его, пока нас не было', async () => {
    const store = await activeOutgoingCall()

    socket().setStatus('closed')
    socket().setStatus('open')
    socket().emit({ type: 'error', data: { request: 'call.resume', message: 'Звонок не найден' } })

    expect(store.phase).toBe('ended')
    expect(store.endMessage).toBe('Звонок завершён')
  })

  it('при обрыве прямого соединения звонящий перезапускает ICE и ждёт восстановления', async () => {
    const store = await activeOutgoingCall()

    peer().connectionState.value = 'failed'
    await nextTick()

    expect(store.phase).toBe('active')
    expect(store.reconnecting).toBe(true)
    expect(peer().restartIce).toHaveBeenCalled()

    peer().connectionState.value = 'connected'
    await nextTick()
    expect(store.reconnecting).toBe(false)

    vi.advanceTimersByTime(RECONNECT_GRACE_MS)
    expect(store.phase).toBe('active')
  })

  it('сбрасывает разговор, если прямое соединение так и не восстановилось', async () => {
    const store = await activeOutgoingCall()

    peer().connectionState.value = 'disconnected'
    await nextTick()
    vi.advanceTimersByTime(RECONNECT_GRACE_MS)

    expect(store.phase).toBe('ended')
    expect(lastSent()).toEqual({ type: 'call.hangup', data: { call_id: 10 } })
  })

  it('знает, кто из пользователей в сети', () => {
    const store = openStore()

    socket().emit({ type: 'presence.snapshot', data: { user_ids: [2, 3] } })
    socket().emit({ type: 'presence.changed', data: { user_id: 3, online: false } })
    socket().emit({ type: 'presence.changed', data: { user_id: 4, online: true } })

    expect([2, 3, 4].map((id) => store.isUserOnline(id))).toEqual([true, false, true])

    socket().setStatus('closed')
    expect(store.isUserOnline(2)).toBe(false)
  })

  it('считает пропущенные входящие, пока их не посмотрели', () => {
    const store = openStore()
    const incoming = makeCall({ caller: bob, callee: me })

    socket().emit({ type: 'call.incoming', data: { call: incoming } })
    socket().emit({
      type: 'call.ended',
      data: { call: { ...incoming, status: 'missed' }, reason: 'missed' },
    })

    expect(store.missedCount).toBe(1)

    store.clearMissed()
    expect(store.missedCount).toBe(0)
  })

  it('отвечает без видео', async () => {
    const store = openStore()
    socket().emit({ type: 'call.incoming', data: { call: makeCall({ caller: bob, callee: me }) } })

    await store.accept({ video: false })

    expect(peer().openMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }))
  })

  it('отправляет и принимает сообщения чата, считая непрочитанные', async () => {
    const store = await activeOutgoingCall()
    const options = peer().createConnection.mock.calls[0]?.[0]

    expect(store.sendChat('  Привет  ')).toBe(true)
    expect(peer().sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat', text: 'Привет' }),
    )
    expect(store.sendChat('   ')).toBe(false)

    options?.onMessage?.({ type: 'chat', id: 'a', text: 'И тебе', sent_at: '2026-10-01T10:01:00Z' })

    expect(store.chatMessages.map((message) => [message.mine, message.text])).toEqual([
      [true, 'Привет'],
      [false, 'И тебе'],
    ])
    expect(store.unreadChat).toBe(1)

    store.setChatOpen(true)
    expect(store.unreadChat).toBe(0)
  })
})
