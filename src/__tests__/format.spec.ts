import { describe, expect, it } from 'vitest'

import { formatDuration } from '@/utils/format'

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [9.7, '0:09'],
    [75, '1:15'],
    [3725, '1:02:05'],
    [-5, '0:00'],
  ])('%s сек → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})
