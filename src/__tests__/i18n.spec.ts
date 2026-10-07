import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { t } from '@/i18n'
import {
  DEFAULT_LOCALE,
  LANGUAGE_NAMES,
  setLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from '@/i18n/locale'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import { formatFileSize } from '@/utils/chatAttachment'
import { formatDay } from '@/utils/format'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') {
      result.set(path, value)
    } else {
      flatten(value, path).forEach((text, nested) => result.set(nested, text))
    }
  }
  return result
}

const messages: Record<Locale, Tree> = { ru, vi }
/** Набор, а не список: у каждой формы множественного числа свой {n} */
const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/{(\w+)}/g)].map((m) => m[1]))].sort()
const base = flatten(messages[DEFAULT_LOCALE]!)

describe.each(SUPPORTED_LOCALES.filter((code) => code !== DEFAULT_LOCALE))('%s.json', (code) => {
  const strings = flatten(messages[code]!)

  it('переводит все ключи русского и не добавляет своих', () => {
    expect([...base.keys()].filter((key) => !strings.has(key))).toEqual([])
    expect([...strings.keys()].filter((key) => !base.has(key))).toEqual([])
  })

  it('сохраняет подстановки {…}', () => {
    strings.forEach((text, key) => {
      expect([key, placeholders(text)]).toEqual([key, placeholders(base.get(key) ?? '')])
    })
  })

  it('не оставляет пустых строк', () => {
    expect([...strings].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([])
  })
})

it('у каждого языка есть название', () => {
  for (const code of SUPPORTED_LOCALES) {
    expect(LANGUAGE_NAMES[code]).toBeTruthy()
  }
})

/** keypath у <i18n-t> не проверяется типами — сверяем с ru.json */
it('keypath в шаблонах есть в ru.json', () => {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        walk(path)
      } else if (path.endsWith('.vue')) {
        files.push(path)
      }
    }
  }
  walk(join(__dirname, '..'))

  const keypaths = files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/keypath="([^"]+)"/g)].map((m) => m[1]!),
  )
  expect(keypaths.length).toBeGreaterThan(0)
  expect(keypaths.filter((key) => !base.has(key))).toEqual([])
})

describe('смена языка', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('русские формы множественного числа', () => {
    expect([1, 3, 5, 11, 21, 22].map((n) => t('calls.missedCount', n))).toEqual([
      'У вас 1 пропущенный звонок',
      'У вас 3 пропущенных звонка',
      'У вас 5 пропущенных звонков',
      'У вас 11 пропущенных звонков',
      'У вас 21 пропущенный звонок',
      'У вас 22 пропущенных звонка',
    ])
  })

  it('тексты, даты и размеры сразу на новом языке', () => {
    setLocale('vi')

    expect(t('common.save')).toBe('Lưu')
    expect(t('calls.missedCount', 5)).toBe('Bạn có 5 cuộc gọi nhỡ')
    expect(formatDay(new Date().toISOString())).toBe('Hôm nay')
    expect(formatFileSize(1536)).toBe('1,5 KB')
    expect(formatDay('2025-10-02T12:00:00Z', new Date('2026-10-07T12:00:00Z'))).toMatch(/2025/)

    setLocale('ru')
    expect(formatFileSize(1536)).toBe('1,5 КБ')
    expect(formatDay('2026-10-02T12:00:00Z', new Date('2026-10-07T12:00:00Z'))).toBe('2 октября')
  })
})
