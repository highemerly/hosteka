/**
 * テーマ（ライト / ダーク / システム）の解決ロジック。
 *
 * 保存先は localStorage であって Cookie ではない。これは意図的な判断:
 * テーマを Cookie に置くと `Vary: Cookie` かユーザー別の HTML が必要になり、
 * 「全ページを CDN キャッシュ可能にする」というレンダリング方針が壊れる。
 * 下の適用スクリプトはキャッシュ済み HTML の一部として全員に同一のものが
 * 配信されるため、キャッシュは保たれる。
 */

import { STORAGE_THEME } from '@/lib/storage-keys'

export const THEME_STORAGE_KEY = STORAGE_THEME

export type ThemePreference = 'light' | 'dark' | 'system'
/** 実際に適用される値。'system' は解決済みでここには現れない */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/**
 * 既定のテーマ。OS の配色設定に従う。
 *
 * 以前は 'light' にしていた。画面が `bg-white` などを直書きしていて、
 * ダークへ倒すと color-scheme だけが効き、フォーム部品だけ黒くなったため。
 * 色がすべてトークン経由になったので 'system' に戻した。
 * 色の直書きを戻すと、OS がダークの人にだけ同じ崩れが出る。
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'

/** 保存値を正規化する。未設定・不正値は既定値に倒す */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE
}

/**
 * 設定値とOSの配色設定から、実際に適用するテーマを決める。
 * @param prefersDark OS がダークを好むか（`matchMedia('(prefers-color-scheme: dark)').matches`）
 */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/**
 * `<head>` で同期実行してFOUCを防ぐスクリプト。
 *
 * 重要: 将来 CSP を導入する場合、このスクリプトは必ず **hash ベース**
 * （`script-src 'sha256-…'`）で許可すること。リクエスト毎の nonce を使うと
 * HTML がキャッシュ不能になり、レンダリング方針全体が無言で破綻する。
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(p!=='light'&&p!=='dark'&&p!=='system')p=${JSON.stringify(DEFAULT_THEME_PREFERENCE)};
var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var e=document.documentElement;
e.classList.toggle('dark',d);
e.style.colorScheme=d?'dark':'light';
}catch(_){}})();`

/** 解決済みテーマを `<html>` に反映する */
export function applyResolvedTheme(theme: ResolvedTheme, root: HTMLElement): void {
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}
