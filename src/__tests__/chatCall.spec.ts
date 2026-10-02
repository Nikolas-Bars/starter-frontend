import { describe, expect, it } from 'vitest'

import type { ChatMessageCall } from '@/types/api'
import { callSummary, isMissedCall } from '@/utils/chatCall'

function call(status: ChatMessageCall['status'], duration: number | null = null): ChatMessageCall {
  return { id: 1, status, duration_seconds: duration }
}

describe('chatCall', () => {
  it('подписывает звонок с точки зрения читающего', () => {
    expect(callSummary(call('ended', 65), true)).toBe('Исходящий звонок, 1:05')
    expect(callSummary(call('ended', 65), false)).toBe('Входящий звонок, 1:05')
    expect(callSummary(call('unavailable'), true)).toBe('Собеседник был не в сети')
    expect(callSummary(call('unavailable'), false)).toBe('Пропущенный звонок')
    expect(callSummary(call('rejected'), false)).toBe('Вы отклонили звонок')
  })

  it('пропущенным считает только входящий, который не застали', () => {
    expect(isMissedCall(call('missed'), false)).toBe(true)
    expect(isMissedCall(call('busy'), false)).toBe(true)
    expect(isMissedCall(call('missed'), true)).toBe(false)
    expect(isMissedCall(call('rejected'), false)).toBe(false)
    expect(isMissedCall(call('ended', 10), false)).toBe(false)
  })
})
