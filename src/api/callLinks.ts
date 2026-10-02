import { http } from '@/api/http'
import type { AuthToken, CallLink, CallLinkInvite, JoinCallLinkPayload } from '@/types/api'

export const callLinksApi = {
  own: () => http.get<CallLink>('call-link'),
  rotate: () => http.post<CallLink>('call-link/rotate'),
  show: (code: string) => http.get<CallLinkInvite>(`call-links/${encodeURIComponent(code)}`),
  join: (code: string, payload: JoinCallLinkPayload) =>
    http.post<AuthToken>(`call-links/${encodeURIComponent(code)}/join`, payload),
}

/** Адрес, который пользователь отправляет гостю */
export function callLinkUrl(code: string): string {
  return `${window.location.origin}/c/${code}`
}
