export type CallSound = 'incoming' | 'outgoing' | 'ended'

interface Tone {
  frequency: number
  /** Секунды от начала цикла */
  start: number
  duration: number
}

interface SoundPattern {
  tones: Tone[]
  /** Через сколько секунд цикл повторяется; null — играет один раз */
  period: number | null
  vibrate?: number[]
}

const PATTERNS: Record<CallSound, SoundPattern> = {
  // Звонок: две пары коротких трелей, затем пауза
  incoming: {
    period: 3,
    tones: [0, 0.45, 1, 1.45].map((start, index) => ({
      frequency: index % 2 === 0 ? 880 : 660,
      start,
      duration: 0.4,
    })),
    vibrate: [400, 200, 400],
  },
  // Длинный гудок 425 Гц: 1 с звучит, 4 с тишина
  outgoing: { period: 5, tones: [{ frequency: 425, start: 0, duration: 1 }] },
  // Короткие гудки «отбой»
  ended: {
    period: null,
    tones: [0, 0.7, 1.4].map((start) => ({ frequency: 425, start, duration: 0.35 })),
  },
}

const VOLUME = 0.2

/** Плавное нарастание и затухание тона, чтобы не было щелчков */
const FADE = 0.02

/**
 * Звуки звонка, синтезированные Web Audio: файлы не нужны, громкость и ритм задаются кодом.
 * Браузер разрешает звук только после действия пользователя на странице, поэтому
 * unlock() нужно вызывать из обработчика клика или нажатия клавиши.
 */
export class CallSounds {
  private context: AudioContext | null = null
  private loop: ReturnType<typeof setInterval> | null = null
  private generation = 0
  private vibrating = false
  private readonly oscillators = new Set<OscillatorNode>()

  unlock(): void {
    const context = this.ensureContext()
    if (context?.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
  }

  play(sound: CallSound): void {
    this.stop()

    const context = this.ensureContext()
    if (context === null) {
      return
    }

    const generation = ++this.generation
    const pattern = PATTERNS[sound]
    const cycle = () => this.playCycle(context, pattern)

    if (pattern.period !== null) {
      this.loop = setInterval(cycle, pattern.period * 1000)
    }

    if (context.state === 'running') {
      cycle()
      return
    }

    void context
      .resume()
      .then(() => {
        if (this.generation === generation) {
          cycle()
        }
      })
      .catch(() => undefined)
  }

  stop(): void {
    this.generation += 1

    if (this.loop !== null) {
      clearInterval(this.loop)
      this.loop = null
    }

    this.oscillators.forEach((oscillator) => {
      oscillator.onended = null
      oscillator.stop()
      oscillator.disconnect()
    })
    this.oscillators.clear()

    if (this.vibrating) {
      navigator.vibrate?.(0)
      this.vibrating = false
    }
  }

  private playCycle(context: AudioContext, pattern: SoundPattern): void {
    // Пока звук заблокирован, время контекста стоит: накопленные циклы зазвучали бы разом
    if (context.state !== 'running') {
      return
    }

    const now = context.currentTime
    for (const tone of pattern.tones) {
      this.playTone(context, tone.frequency, now + tone.start, now + tone.start + tone.duration)
    }

    if (pattern.vibrate) {
      this.vibrating = navigator.vibrate?.(pattern.vibrate) ?? false
    }
  }

  private playTone(context: AudioContext, frequency: number, start: number, end: number): void {
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(VOLUME, start + FADE)
    gain.gain.setValueAtTime(VOLUME, end - FADE)
    gain.gain.linearRampToValueAtTime(0, end)

    oscillator.connect(gain).connect(context.destination)
    oscillator.onended = () => {
      this.oscillators.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(end)
    this.oscillators.add(oscillator)
  }

  private ensureContext(): AudioContext | null {
    if (this.context === null && typeof AudioContext !== 'undefined') {
      this.context = new AudioContext()
    }
    return this.context
  }
}
