import { apiUrl, ApiError } from '@/api/http'
import { tokenStorage } from '@/api/tokenStorage'
import { t } from '@/i18n'
import { locale } from '@/i18n/locale'
import type { ApiResponse, ChatAttachment } from '@/types/api'

export interface UploadOptions {
  /** Записанное голосовое */
  voice?: boolean
  /** Без сжатия: фото и видео уйдут обычным файлом */
  asFile?: boolean
  /** Доля отправленного, 0–1 */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * POST /api/attachments. Через XMLHttpRequest, а не fetch: fetch не сообщает, сколько уже отправлено.
 */
export function uploadAttachment(
  file: Blob,
  name: string,
  options: UploadOptions = {},
): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file, name)
    if (options.voice) {
      form.append('voice', '1')
    }
    if (options.asFile) {
      form.append('as_file', '1')
    }

    xhr.open('POST', apiUrl('/api/attachments'))
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Accept-Language', locale.value)
    const token = tokenStorage.get()
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      let payload: ApiResponse<ChatAttachment> | null = null
      try {
        payload = JSON.parse(xhr.responseText) as ApiResponse<ChatAttachment>
      } catch {
        payload = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload !== null) {
        resolve(payload.data)
        return
      }
      reject(
        new ApiError(
          payload?.message || t('errors.uploadFailed', { status: xhr.status }),
          xhr.status,
          payload?.errors ?? {},
        ),
      )
    }
    xhr.onerror = () => reject(new ApiError(t('errors.network'), 0))
    xhr.onabort = () => reject(new ApiError(t('errors.uploadAborted'), 0))

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}
