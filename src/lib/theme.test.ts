import { describe, it, expect } from 'vitest'

import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isThemePreference,
  normalizeThemePreference,
  resolveTheme,
} from './theme'

describe('isThemePreference', () => {
  it('正しい値を受け入れる', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
  })

  it('不正な値を拒否する', () => {
    for (const v of ['', 'Light', 'auto', null, undefined, 0, {}, []]) {
      expect(isThemePreference(v)).toBe(false)
    }
  })
})

describe('normalizeThemePreference', () => {
  it('正しい値はそのまま返す', () => {
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('system')).toBe('system')
  })

  it('未設定・不正値は既定値（system）に倒す', () => {
    expect(normalizeThemePreference(null)).toBe('system')
    expect(normalizeThemePreference(undefined)).toBe('system')
    expect(normalizeThemePreference('nonsense')).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('明示指定は OS 設定より優先される', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system は OS 設定に従う', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('THEME_INIT_SCRIPT', () => {
  // このスクリプトは <head> で同期実行されFOUCを防ぐ唯一の仕組みなので、
  // 壊れていないことを実際に評価して確かめる。
  function run(stored: string | null, prefersDark: boolean) {
    const classes = new Set<string>()
    const root = {
      classList: {
        toggle(name: string, on: boolean) {
          if (on) classes.add(name)
          else classes.delete(name)
        },
      },
      style: {} as { colorScheme?: string },
    }
    const sandbox = {
      localStorage: { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) },
      window: { matchMedia: () => ({ matches: prefersDark }) },
      document: { documentElement: root },
    }
    new Function(
      'localStorage',
      'window',
      'document',
      THEME_INIT_SCRIPT
    )(sandbox.localStorage, sandbox.window, sandbox.document)

    return { dark: classes.has('dark'), colorScheme: root.style.colorScheme }
  }

  it('保存値 dark でダークを適用する', () => {
    expect(run('dark', false)).toEqual({ dark: true, colorScheme: 'dark' })
  })

  it('保存値 light は OS がダークでもライトを適用する', () => {
    expect(run('light', true)).toEqual({ dark: false, colorScheme: 'light' })
  })

  it('保存値 system は OS 設定に従う', () => {
    expect(run('system', true)).toEqual({ dark: true, colorScheme: 'dark' })
    expect(run('system', false)).toEqual({ dark: false, colorScheme: 'light' })
  })

  it('未設定は OS 設定に従う', () => {
    expect(run(null, true)).toEqual({ dark: true, colorScheme: 'dark' })
    expect(run(null, false)).toEqual({ dark: false, colorScheme: 'light' })
  })

  it('不正な保存値でも落ちず OS 設定に従う', () => {
    expect(run('garbage', true)).toEqual({ dark: true, colorScheme: 'dark' })
    expect(run('garbage', false)).toEqual({ dark: false, colorScheme: 'light' })
  })

  it('localStorage が例外を投げても落ちない', () => {
    const classes = new Set<string>()
    const root = {
      classList: { toggle: (n: string, on: boolean) => (on ? classes.add(n) : classes.delete(n)) },
      style: {} as { colorScheme?: string },
    }
    expect(() =>
      new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(
        {
          getItem() {
            throw new Error('SecurityError: storage is disabled')
          },
        },
        { matchMedia: () => ({ matches: false }) },
        { documentElement: root }
      )
    ).not.toThrow()
  })
})
