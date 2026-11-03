'use client'

import { useCallback, useSyncExternalStore } from 'react'

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  normalizeThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * `"<設定値>:<解決後>"`。文字列にしてあるのは useSyncExternalStore が
 * スナップショットの参照等価性を要求するため（文字列なら値比較で足りる）。
 */
type Snapshot = `${ThemePreference}:${ResolvedTheme}`

function readStoredPreference(): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    // プライベートブラウジング等で localStorage が使えない場合
    return DEFAULT_THEME_PREFERENCE
  }
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function getSnapshot(): Snapshot {
  const preference = readStoredPreference()
  const resolved = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches)
  return `${preference}:${resolved}`
}

/**
 * サーバーとハイドレーション中は localStorage を読めないため null を返す。
 * これがそのまま「まだ確定していない」の合図になり、別途 mounted state を
 * 持つ必要がなくなる（＝エフェクト内 setState を避けられる）。
 */
function getServerSnapshot(): Snapshot | null {
  return null
}

function subscribe(onStoreChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY)

  // 'system' のときだけOS設定の変化に追従する
  const onMediaChange = (event: MediaQueryListEvent) => {
    if (readStoredPreference() === 'system') {
      applyResolvedTheme(resolveTheme('system', event.matches), document.documentElement)
    }
    emit()
  }

  // 別タブでの変更に追従する
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return
    const preference = readStoredPreference()
    applyResolvedTheme(resolveTheme(preference, media.matches), document.documentElement)
    emit()
  }

  if (listeners.size === 0) {
    media.addEventListener('change', onMediaChange)
    window.addEventListener('storage', onStorage)
  }
  listeners.add(onStoreChange)

  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0) {
      media.removeEventListener('change', onMediaChange)
      window.removeEventListener('storage', onStorage)
    }
  }
}

/**
 * テーマの取得・切替。
 *
 * Provider は使わない。初回の適用は `<head>` の同期スクリプト
 * （`THEME_INIT_SCRIPT`）が済ませているので、このフックはその状態を読み出して
 * 以後の変更を扱うだけでよい。
 *
 * `mounted` が false の間はテーマ依存のUIを確定させないこと。サーバーは
 * localStorage を読めず、推測して描画するとハイドレーション不一致になる。
 */
export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setPreference = useCallback((next: ThemePreference) => {
    const prefersDark = window.matchMedia(DARK_QUERY).matches

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // 保存できなくてもセッション内の切替は成立させる
    }

    applyResolvedTheme(resolveTheme(next, prefersDark), document.documentElement)
    emit()
  }, [])

  if (snapshot === null) {
    return {
      preference: DEFAULT_THEME_PREFERENCE,
      resolved: 'light' as ResolvedTheme,
      setPreference,
      mounted: false,
    }
  }

  const [preference, resolved] = snapshot.split(':') as [ThemePreference, ResolvedTheme]
  return { preference, resolved, setPreference, mounted: true }
}
