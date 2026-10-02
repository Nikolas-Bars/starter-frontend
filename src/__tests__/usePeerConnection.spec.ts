import { afterEach, describe, expect, it, vi } from 'vitest'

import { MediaAccessError, usePeerConnection } from '@/composables/usePeerConnection'

function stubGetUserMedia(impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(impl)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  return getUserMedia
}

function fakeStream(kinds: string[]): MediaStream {
  const tracks = kinds.map((kind) => ({ kind, enabled: true, stop: vi.fn<() => void>() }))
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
  } as unknown as MediaStream
}

describe('usePeerConnection.openMedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('сообщает о запрете доступа и не переспрашивает про микрофон', async () => {
    const getUserMedia = stubGetUserMedia(() =>
      Promise.reject(new DOMException('denied', 'NotAllowedError')),
    )

    const error = await usePeerConnection()
      .openMedia()
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(MediaAccessError)
    expect((error as MediaAccessError).reason).toBe('denied')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('без камеры звонит только со звуком', async () => {
    stubGetUserMedia((constraints) =>
      constraints.video
        ? Promise.reject(new DOMException('no camera', 'NotFoundError'))
        : Promise.resolve(fakeStream(['audio'])),
    )
    const peer = usePeerConnection()

    await peer.openMedia()

    expect(peer.hasVideo.value).toBe(false)
    expect(peer.cameraEnabled.value).toBe(false)
  })

  it('сообщает, что камера занята другим приложением', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('busy', 'NotReadableError')))

    const error = await usePeerConnection()
      .openMedia()
      .catch((e: unknown) => e)

    expect((error as MediaAccessError).reason).toBe('busy')
  })

  it('сообщает, что браузер не поддерживает звонки', async () => {
    vi.stubGlobal('navigator', {})

    const error = await usePeerConnection()
      .openMedia()
      .catch((e: unknown) => e)

    expect((error as MediaAccessError).reason).toBe('unsupported')
  })
})
