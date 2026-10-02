import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

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
  let issueTicket: Mock<(token: string) => Promise<string | null>>
  let client: SignalingSocket

  const last = (): FakeWebSocket => {
    const socket = sockets[sockets.length - 1]
    if (!socket) {
      throw new Error('Сокет не создан')
    }
    return socket
  }

  /** Билет запрашивается асинхронно: даём промисам выполниться */
  async function connect(token: string): Promise<void> {
    client.connect(token)
    await vi.advanceTimersByTimeAsync(0)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sockets = []
    statuses = []
    issueTicket = vi.fn<(token: string) => Promise<string | null>>(async (token) =>
      token === 'expired' ? null : `ticket for ${token}`,
    )
    client = new SignalingSocket('ws://test', {
      issueTicket,
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

  it('подключается по одноразовому билету, а не по токену, и открыт только после ready', async () => {
    await connect('1|secret token')

    expect(issueTicket).toHaveBeenCalledWith('1|secret token')
    expect(last().url).toBe('ws://test?ticket=ticket%20for%201%7Csecret%20token')
    expect(client.status).toBe('connecting')
    expect(client.send({ type: 'ping' })).toBe(false)

    last().receive({ type: 'ready', data: { user_id: 1 } })

    expect(client.status).toBe('open')
    expect(client.send({ type: 'call.invite', data: { callee_id: 2 } })).toBe(true)
    expect(last().sent).toEqual([{ type: 'call.invite', data: { callee_id: 2 } }])
  })

  it('отдаёт подписчикам сообщения сервера и пропускает мусор', async () => {
    const received: ServerMessage[] = []
    client.onMessage((message) => received.push(message))
    await connect('token')

    last().onmessage?.({ data: 'not json' } as MessageEvent)
    last().receive({ no: 'type' })
    last().receive({ type: 'pong' })

    expect(received).toEqual([{ type: 'pong' }])
  })

  it('шлёт ping, пока соединение открыто', async () => {
    await connect('token')
    last().receive({ type: 'ready', data: { user_id: 1 } })

    vi.advanceTimersByTime(2500)

    expect(last().sent).toEqual([{ type: 'ping' }, { type: 'ping' }])
  })

  it('переподключается после обрыва с нарастающей задержкой и новым билетом', async () => {
    await connect('token')
    last().drop()

    expect(client.status).toBe('closed')
    await vi.advanceTimersByTimeAsync(99)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)

    last().drop()
    await vi.advanceTimersByTimeAsync(499)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(3)
    expect(issueTicket).toHaveBeenCalledTimes(3)

    last().receive({ type: 'ready', data: { user_id: 1 } })
    expect(client.status).toBe('open')
  })

  it('повторяет попытку, если билет не удалось получить', async () => {
    issueTicket.mockRejectedValueOnce(new Error('offline'))

    await connect('token')

    expect(client.status).toBe('closed')
    expect(sockets).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(100)
    expect(sockets).toHaveLength(1)
  })

  it('не переподключается, если сервер отверг подключение', async () => {
    await connect('token')
    last().drop(4401)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(client.status).toBe('unauthorized')
    expect(sockets).toHaveLength(1)
  })

  it('не открывает сокет, если билет не выдали из-за недействительного токена', async () => {
    await connect('expired')

    await vi.advanceTimersByTimeAsync(10_000)

    expect(client.status).toBe('unauthorized')
    expect(sockets).toHaveLength(0)
  })

  it('после disconnect закрывает сокет и больше не подключается', async () => {
    await connect('token')
    const socket = last()

    client.disconnect()
    socket.drop(1000)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(socket.closedWith).toBe(1000)
    expect(sockets).toHaveLength(1)
    expect(statuses).toEqual(['connecting', 'idle'])
  })

  it('disconnect во время запроса билета отменяет подключение', async () => {
    client.connect('token')
    client.disconnect()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sockets).toHaveLength(0)
    expect(client.status).toBe('idle')
  })

  it('повторный connect с тем же токеном не пересоздаёт соединение', async () => {
    await connect('token')
    await connect('token')

    expect(sockets).toHaveLength(1)

    await connect('other')

    expect(sockets).toHaveLength(2)
    expect(sockets[0]?.closedWith).toBe(1000)
  })
})
