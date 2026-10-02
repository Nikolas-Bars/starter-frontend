import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CallSounds } from '@/realtime/callSounds'

class FakeParam {
  value = 0
  setValueAtTime = vi.fn<(value: number, time: number) => void>()
  linearRampToValueAtTime = vi.fn<(value: number, time: number) => void>()
}

class FakeNode {
  connect = vi.fn<(target: FakeNode) => FakeNode>((target) => target)
  disconnect = vi.fn<() => void>()
}

class FakeOscillator extends FakeNode {
  frequency = new FakeParam()
  onended: (() => void) | null = null
  start = vi.fn<(time: number) => void>()
  stop = vi.fn<(time?: number) => void>()
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: AudioContextState = 'running'
  currentTime = 0
  destination = new FakeNode()
  oscillators: FakeOscillator[] = []

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }

  createGain(): FakeGain {
    return new FakeGain()
  }

  resume = vi.fn<() => Promise<void>>(async () => {
    this.state = 'running'
  })
}

function context(): FakeAudioContext {
  const instance = FakeAudioContext.instances[0]
  if (!instance) {
    throw new Error('AudioContext не создан')
  }
  return instance
}

describe('CallSounds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeAudioContext.instances = []
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('повторяет трель входящего, пока её не остановят', () => {
    const sounds = new CallSounds()

    sounds.play('incoming')
    expect(context().oscillators).toHaveLength(4)

    vi.advanceTimersByTime(3000)
    expect(context().oscillators).toHaveLength(8)

    sounds.stop()
    context().oscillators.forEach((oscillator) => expect(oscillator.stop).toHaveBeenCalled())

    vi.advanceTimersByTime(10000)
    expect(context().oscillators).toHaveLength(8)
  })

  it('короткие гудки отбоя звучат один раз', () => {
    const sounds = new CallSounds()

    sounds.play('ended')
    vi.advanceTimersByTime(10000)

    expect(context().oscillators).toHaveLength(3)
  })

  it('пока звук заблокирован браузером, ждёт разрешения и не копит циклы', async () => {
    const sounds = new CallSounds()
    sounds.unlock()
    context().state = 'suspended'
    context().resume.mockImplementation(() => new Promise(() => undefined))

    sounds.play('outgoing')
    vi.advanceTimersByTime(15000)

    expect(context().oscillators).toHaveLength(0)

    context().state = 'running'
    vi.advanceTimersByTime(5000)
    expect(context().oscillators).toHaveLength(1)
  })

  it('без Web Audio молчит, а не падает', () => {
    vi.stubGlobal('AudioContext', undefined)
    const sounds = new CallSounds()

    expect(() => {
      sounds.unlock()
      sounds.play('incoming')
      sounds.stop()
    }).not.toThrow()
  })
})
