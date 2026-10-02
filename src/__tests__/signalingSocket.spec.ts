import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SignalingSocket, type SocketStatus } from '@/realtime/socket'
import type { ServerMessage } from '@/types/call'

class FakeWebSocket {
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  readonly sent: unknown[] = []
  closedWith: number | null = null

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }

  close(code: number): void {
    this.closedWith = code
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }

  drop(code = 1006): void {
    this.onclose?.({ code } as CloseEvent)
  }
}

describe('SignalingSocket', () => {
  let sockets: FakeWebSocket[]
  let statuses: SocketStatus[]
  let client: SignalingSocket

  const last = (): FakeWebSocket => {
    const socket = sockets[sockets.length - 1]
    if (!socket) {
      throw new Error('Сокет не создан')
    }
    return socket
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sockets = []
    statuses = []
    client = new SignalingSocket('ws://test', {
      reconnectDelays: [100, 500],
      heartbeatMs: 1000,
      createSocket: (url) => {
        const socket = new FakeWebSocket(url)
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    })
    client.onStatus((status) => statuses.push(status))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('передаёт токен в URL и считается открытым только после ready', () => {
    client.connect('1|secret token')

    expect(last().url).toBe('ws://test?token=1%7Csecret%20token')
    expect(client.status).toBe('connecting')
    expect(client.send({ type: 'ping' })).toBe(false)

    last().receive({ type: 'ready', data: { user_id: 1 } })

    expect(client.status).toBe('open')
    expect(client.send({ type: 'call.invite', data: { callee_id: 2 } })).toBe(true)
    expect(last().sent).toEqual([{ type: 'call.invite', data: { callee_id: 2 } }])
  })

  it('отдаёт подписчикам сообщения сервера и пропускает мусор', () => {
    const received: ServerMessage[] = []
    client.onMessage((message) => received.push(message))
    client.connect('token')

    last().onmessage?.({ data: 'not json' } as MessageEvent)
    last().receive({ no: 'type' })
    last().receive({ type: 'pong' })

    expect(received).toEqual([{ type: 'pong' }])
  })

  it('шлёт ping, пока соединение открыто', () => {
    client.connect('token')
    last().receive({ type: 'ready', data: { user_id: 1 } })

    vi.advanceTimersByTime(2500)

    expect(last().sent).toEqual([{ type: 'ping' }, { type: 'ping' }])
  })

  it('переподключается после обрыва с нарастающей задержкой', () => {
    client.connect('token')
    last().drop()

    expect(client.status).toBe('closed')
    vi.advanceTimersByTime(99)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)

    last().drop()
    vi.advanceTimersByTime(499)
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(3)

    last().receive({ type: 'ready', data: { user_id: 1 } })
    expect(client.status).toBe('open')
  })

  it('не переподключается, если сервер отверг токен', () => {
    client.connect('expired')
    last().drop(4401)

    vi.advanceTimersByTime(10_000)

    expect(client.status).toBe('unauthorized')
    expect(sockets).toHaveLength(1)
  })

  it('после disconnect закрывает сокет и больше не подключается', () => {
    client.connect('token')
    const socket = last()

    client.disconnect()
    socket.drop(1000)
    vi.advanceTimersByTime(10_000)

    expect(socket.closedWith).toBe(1000)
    expect(sockets).toHaveLength(1)
    expect(statuses).toEqual(['connecting', 'idle'])
  })

  it('повторный connect с тем же токеном не пересоздаёт соединение', () => {
    client.connect('token')
    client.connect('token')

    expect(sockets).toHaveLength(1)

    client.connect('other')

    expect(sockets).toHaveLength(2)
    expect(sockets[0]?.closedWith).toBe(1000)
  })
})
