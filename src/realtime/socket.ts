import type { ClientMessage, ServerMessage } from '@/types/call'

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'unauthorized'

type Listener<T> = (value: T) => void

/** Сервер закрывает соединение этим кодом, если токен недействителен */
const CLOSE_UNAUTHORIZED = 4401

const CLOSE_NORMAL = 1000

const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]

const DEFAULT_HEARTBEAT_MS = 25000

export interface SignalingSocketOptions {
  /** Задержки между попытками переподключения; последняя повторяется бесконечно */
  reconnectDelays?: number[]
  /** Как часто слать ping, чтобы прокси и сервер не закрыли молчащее соединение */
  heartbeatMs?: number
  createSocket?: (url: string) => WebSocket
}

export function defaultSignalingUrl(): string {
  return import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:8091`
}

/**
 * Соединение с сервером сигнализации поверх встроенного WebSocket.
 * Само переподключается после обрывов, кроме случая, когда сервер отверг токен.
 */
export class SignalingSocket {
  private socket: WebSocket | null = null
  private token: string | null = null
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private currentStatus: SocketStatus = 'idle'

  private readonly messageListeners = new Set<Listener<ServerMessage>>()
  private readonly statusListeners = new Set<Listener<SocketStatus>>()
  private readonly reconnectDelays: number[]
  private readonly heartbeatMs: number
  private readonly createSocket: (url: string) => WebSocket

  constructor(
    private readonly url: string,
    options: SignalingSocketOptions = {},
  ) {
    this.reconnectDelays = options.reconnectDelays ?? DEFAULT_RECONNECT_DELAYS
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
    this.createSocket = options.createSocket ?? ((socketUrl) => new WebSocket(socketUrl))
  }

  get status(): SocketStatus {
    return this.currentStatus
  }

  connect(token: string): void {
    if (this.token === token && this.socket !== null) {
      return
    }

    this.disconnect()
    this.token = token
    this.open()
  }

  disconnect(): void {
    this.token = null
    this.attempt = 0
    this.clearTimers()

    const socket = this.socket
    this.socket = null
    socket?.close(CLOSE_NORMAL)

    this.setStatus('idle')
  }

  /** @returns false, если соединения сейчас нет и сообщение не ушло */
  send(message: ClientMessage): boolean {
    if (this.socket === null || this.currentStatus !== 'open') {
      return false
    }

    this.socket.send(JSON.stringify(message))
    return true
  }

  onMessage(listener: Listener<ServerMessage>): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onStatus(listener: Listener<SocketStatus>): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private open(): void {
    if (this.token === null) {
      return
    }

    this.setStatus('connecting')

    const socket = this.createSocket(`${this.url}?token=${encodeURIComponent(this.token)}`)
    this.socket = socket

    socket.onmessage = (event: MessageEvent) => {
      const message = this.parse(event.data)
      if (message === null) {
        return
      }

      if (message.type === 'ready') {
        this.attempt = 0
        this.setStatus('open')
        this.startHeartbeat()
      }

      this.messageListeners.forEach((listener) => listener(message))
    }

    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) {
        return
      }

      this.socket = null
      this.clearTimers()

      if (event.code === CLOSE_UNAUTHORIZED) {
        this.token = null
        this.setStatus('unauthorized')
        return
      }

      this.setStatus('closed')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.token === null) {
      return
    }

    const delay =
      this.reconnectDelays[Math.min(this.attempt, this.reconnectDelays.length - 1)] ?? 1000
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => this.send({ type: 'ping' }), this.heartbeatMs)
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private setStatus(status: SocketStatus): void {
    if (this.currentStatus === status) {
      return
    }
    this.currentStatus = status
    this.statusListeners.forEach((listener) => listener(status))
  }

  private parse(data: unknown): ServerMessage | null {
    if (typeof data !== 'string') {
      return null
    }

    try {
      const message: unknown = JSON.parse(data)
      return typeof message === 'object' && message !== null && 'type' in message
        ? (message as ServerMessage)
        : null
    } catch {
      return null
    }
  }
}
